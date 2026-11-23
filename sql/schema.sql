-- =====================================================================
-- Piluliers cabinet — structure de la base (Supabase / PostgreSQL)
-- Accès réservé aux membres du cabinet (code cabinet), journal complet,
-- double contrôle des changements de traitement.
-- =====================================================================

create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------
-- Membres du cabinet et réglages
-- ---------------------------------------------------------------------
create table public.membres (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  nom        text not null check (length(trim(nom)) between 1 and 60),
  created_at timestamptz not null default now()
);

create table public.reglages (
  id          int primary key default 1 check (id = 1),
  code_hash   text,
  max_membres int not null default 6
);
insert into public.reglages (id) values (1);

create or replace function public.est_membre()
returns boolean language sql stable security definer
set search_path = public as $$
  select exists (select 1 from public.membres where user_id = auth.uid());
$$;

create or replace function public.rejoindre_cabinet(p_code text, p_nom text)
returns boolean language plpgsql security definer
set search_path = public, extensions as $$
declare
  v_hash text; v_max int; v_nb int;
begin
  if auth.uid() is null then raise exception 'Non connecté'; end if;
  if exists (select 1 from membres where user_id = auth.uid()) then return true; end if;
  select code_hash, max_membres into v_hash, v_max from reglages where id = 1;
  if v_hash is null or extensions.crypt(coalesce(p_code, ''), v_hash) <> v_hash then
    perform pg_sleep(1);
    raise exception 'Code cabinet incorrect';
  end if;
  select count(*) into v_nb from membres;
  if v_nb >= v_max then raise exception 'Nombre maximum de membres atteint'; end if;
  insert into membres (user_id, nom) values (auth.uid(), trim(p_nom));
  return true;
end $$;

create or replace function public.changer_code_cabinet(p_nouveau text)
returns boolean language plpgsql security definer
set search_path = public, extensions as $$
begin
  if not public.est_membre() then raise exception 'Accès refusé'; end if;
  if length(coalesce(p_nouveau, '')) < 8 then raise exception 'Le code doit faire au moins 8 caractères'; end if;
  update reglages set code_hash = extensions.crypt(p_nouveau, extensions.gen_salt('bf')) where id = 1;
  return true;
end $$;

-- ---------------------------------------------------------------------
-- Patients
-- ---------------------------------------------------------------------
create table public.patients (
  id               uuid primary key default gen_random_uuid(),
  nom              text not null,
  prenom           text not null,
  date_naissance   date,
  statut           text not null default 'actif'
                   check (statut in ('actif', 'hospitalise', 'suspendu', 'arrete')),
  statut_depuis    date,
  jour_preparation smallint check (jour_preparation between 1 and 7),  -- 1 = lundi
  lieu_preparation text not null default 'cabinet' check (lieu_preparation in ('cabinet', 'domicile')),
  medecin          text,
  pharmacie        text,
  allergies        text,
  consignes        text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  updated_by       uuid default auth.uid()
);

-- ---------------------------------------------------------------------
-- Ordonnances (photo dans le stockage privé « documents »)
-- ---------------------------------------------------------------------
create table public.ordonnances (
  id                uuid primary key default gen_random_uuid(),
  patient_id        uuid not null references public.patients(id) on delete cascade,
  date_prescription date not null,
  prescripteur      text,
  date_fin          date,
  photo_path        text,
  remarque          text,
  archivee          boolean not null default false,
  created_at        timestamptz not null default now(),
  created_by        uuid default auth.uid()
);
create index on public.ordonnances (patient_id);

-- ---------------------------------------------------------------------
-- Lignes de traitement
-- ---------------------------------------------------------------------
create table public.lignes (
  id                uuid primary key default gen_random_uuid(),
  patient_id        uuid not null references public.patients(id) on delete cascade,
  ordonnance_id     uuid references public.ordonnances(id) on delete set null,
  medicament        text not null,
  dosage            text,
  forme             text,
  matin             numeric(4,2) not null default 0 check (matin >= 0),
  midi              numeric(4,2) not null default 0 check (midi >= 0),
  soir              numeric(4,2) not null default 0 check (soir >= 0),
  coucher           numeric(4,2) not null default 0 check (coucher >= 0),
  si_besoin         text,
  jours             smallint[] not null default '{1,2,3,4,5,6,7}',
  date_debut        date,
  date_fin          date,
  consignes         text,
  hors_pilulier     boolean not null default false,
  actif             boolean not null default true,
  statut_validation text not null default 'a_valider' check (statut_validation in ('a_valider', 'valide')),
  modifie_par       uuid,
  modifie_le        timestamptz,
  valide_par        uuid,
  valide_le         timestamptz,
  created_at        timestamptz not null default now()
);
create index on public.lignes (patient_id);

-- Tout changement du contenu d'une ligne la repasse « à valider ».
-- La validation doit être faite par une autre personne que l'auteur du changement.
create or replace function public.lignes_controle()
returns trigger language plpgsql security definer
set search_path = public as $$
begin
  if tg_op = 'INSERT' or
     (new.medicament, new.dosage, new.forme, new.matin, new.midi, new.soir, new.coucher,
      new.si_besoin, new.jours, new.date_debut, new.date_fin, new.consignes,
      new.hors_pilulier, new.actif, new.ordonnance_id)
     is distinct from
     (old.medicament, old.dosage, old.forme, old.matin, old.midi, old.soir, old.coucher,
      old.si_besoin, old.jours, old.date_debut, old.date_fin, old.consignes,
      old.hors_pilulier, old.actif, old.ordonnance_id)
  then
    new.modifie_par := auth.uid();
    new.modifie_le := now();
    new.statut_validation := 'a_valider';
    new.valide_par := null;
    new.valide_le := null;
  elsif new.statut_validation = 'valide' and old.statut_validation = 'a_valider' then
    if old.modifie_par is not null and old.modifie_par = auth.uid() then
      raise exception 'Le double contrôle doit être fait par une autre infirmière';
    end if;
    new.valide_par := auth.uid();
    new.valide_le := now();
  elsif new.statut_validation is distinct from old.statut_validation then
    raise exception 'Changement de statut non autorisé';
  end if;
  return new;
end $$;

create trigger lignes_controle before insert or update on public.lignes
  for each row execute function public.lignes_controle();

-- ---------------------------------------------------------------------
-- Piluliers préparés
-- ---------------------------------------------------------------------
create table public.preparations (
  id         uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patients(id) on delete cascade,
  semaine_du date not null,
  nb_jours   smallint not null default 7,
  prepare_par uuid default auth.uid(),
  prepare_le timestamptz not null default now(),
  contenu    jsonb,
  photo_path text,
  remarque   text
);
create index on public.preparations (patient_id, prepare_le desc);

-- ---------------------------------------------------------------------
-- Journal : qui a fait quoi, quand (non modifiable depuis l'appli)
-- ---------------------------------------------------------------------
create table public.journal (
  id         bigint generated always as identity primary key,
  quand      timestamptz not null default now(),
  auteur     uuid,
  table_nom  text not null,
  action     text not null,
  patient_id uuid,
  enreg_id   uuid,
  avant      jsonb,
  apres      jsonb
);
create index on public.journal (patient_id, quand desc);

create or replace function public.journaliser()
returns trigger language plpgsql security definer
set search_path = public as $$
declare
  v_old jsonb := case when tg_op <> 'INSERT' then to_jsonb(old) end;
  v_new jsonb := case when tg_op <> 'DELETE' then to_jsonb(new) end;
  v_rec jsonb := coalesce(v_new, v_old);
begin
  insert into journal (auteur, table_nom, action, patient_id, enreg_id, avant, apres)
  values (
    auth.uid(), tg_table_name, tg_op,
    case when tg_table_name = 'patients' then (v_rec->>'id')::uuid else (v_rec->>'patient_id')::uuid end,
    (v_rec->>'id')::uuid, v_old, v_new
  );
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;

create or replace function public.patients_maj()
returns trigger language plpgsql
set search_path = public as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end $$;

create trigger patients_maj before update on public.patients
  for each row execute function public.patients_maj();

create trigger journal_patients after insert or update or delete on public.patients
  for each row execute function public.journaliser();
create trigger journal_ordonnances after insert or update or delete on public.ordonnances
  for each row execute function public.journaliser();
create trigger journal_lignes after insert or update or delete on public.lignes
  for each row execute function public.journaliser();
create trigger journal_preparations after insert or update or delete on public.preparations
  for each row execute function public.journaliser();

-- ---------------------------------------------------------------------
-- Sécurité d'accès (RLS) : uniquement les membres du cabinet
-- ---------------------------------------------------------------------
alter table public.membres      enable row level security;
alter table public.reglages     enable row level security;
alter table public.patients     enable row level security;
alter table public.ordonnances  enable row level security;
alter table public.lignes       enable row level security;
alter table public.preparations enable row level security;
alter table public.journal      enable row level security;

revoke all on all tables in schema public from anon;
revoke all on public.reglages, public.membres, public.journal from authenticated;

create policy membres_lecture on public.membres for select to authenticated
  using (public.est_membre());
create policy membres_mon_nom on public.membres for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy patients_membres on public.patients for all to authenticated
  using (public.est_membre()) with check (public.est_membre());
create policy ordonnances_membres on public.ordonnances for all to authenticated
  using (public.est_membre()) with check (public.est_membre());
create policy lignes_membres on public.lignes for all to authenticated
  using (public.est_membre()) with check (public.est_membre());
create policy preparations_membres on public.preparations for all to authenticated
  using (public.est_membre()) with check (public.est_membre());
create policy journal_lecture on public.journal for select to authenticated
  using (public.est_membre());

grant select, update (nom) on public.membres to authenticated;
grant select, insert, update, delete on public.patients, public.ordonnances,
  public.lignes, public.preparations to authenticated;
grant select on public.journal to authenticated;

revoke execute on function public.rejoindre_cabinet(text, text) from public, anon;
revoke execute on function public.changer_code_cabinet(text) from public, anon;
revoke execute on function public.est_membre() from public, anon;
revoke execute on function public.journaliser() from public, anon, authenticated;
revoke execute on function public.lignes_controle() from public, anon, authenticated;
grant execute on function public.rejoindre_cabinet(text, text) to authenticated;
grant execute on function public.changer_code_cabinet(text) to authenticated;
grant execute on function public.est_membre() to authenticated;

-- ---------------------------------------------------------------------
-- Stockage privé des photos (ordonnances, piluliers)
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('documents', 'documents', false, 10485760,
        array['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
on conflict (id) do nothing;

create policy documents_membres_lecture on storage.objects for select to authenticated
  using (bucket_id = 'documents' and public.est_membre());
create policy documents_membres_ajout on storage.objects for insert to authenticated
  with check (bucket_id = 'documents' and public.est_membre());
create policy documents_membres_suppression on storage.objects for delete to authenticated
  using (bucket_id = 'documents' and public.est_membre());

-- =====================================================================
-- Base publique des médicaments (ANSM) — référentiel en lecture seule
-- Alimentée par la fonction serveur supabase/functions/maj-bdpm
-- =====================================================================
create extension if not exists pg_trgm with schema extensions;

create table public.medicaments_ref (
  cis text primary key, denomination text not null, nom text not null, nom_norm text,
  forme text, voies text, dosage text, dosage_num text,
  commercialise boolean not null default false, autorise boolean not null default true,
  titulaire text, surveillance boolean not null default false, substances text,
  groupe_id int, groupe_libelle text, type_generique smallint,
  cle1 text, cle2 text, recherche text not null, maj_le timestamptz not null default now()
);
create index medicaments_ref_recherche_trgm on public.medicaments_ref using gin (recherche extensions.gin_trgm_ops);
create index medicaments_ref_cle1 on public.medicaments_ref (cle1);
create index medicaments_ref_cle2 on public.medicaments_ref (cle2);
create index medicaments_ref_groupe on public.medicaments_ref (groupe_id);
alter table public.medicaments_ref enable row level security;
revoke all on public.medicaments_ref from anon, authenticated;
grant select on public.medicaments_ref to authenticated;
create policy medicaments_lecture on public.medicaments_ref for select to authenticated using (public.est_membre());

create table public.config_privee (cle text primary key, valeur text not null);
alter table public.config_privee enable row level security;
revoke all on public.config_privee from anon, authenticated;

alter table public.lignes add column cis text;

-- Fonctions : chercher_medicaments(texte normalisé), equivalents_medicament(cis),
-- reconnaitre_medicaments(lignes normalisées) — voir la base pour le détail.

-- =====================================================================
-- Pharmacies partenaires et envoi des ordonnances
-- =====================================================================
create table public.pharmacies (
  id uuid primary key default gen_random_uuid(), nom text not null, adresse text, telephone text, email text,
  actif boolean not null default true, created_at timestamptz not null default now()
);
alter table public.pharmacies enable row level security;
revoke all on public.pharmacies from anon;
grant select, insert, update, delete on public.pharmacies to authenticated;
create policy pharmacies_membres on public.pharmacies for all to authenticated
  using (public.est_membre()) with check (public.est_membre());
alter table public.patients add column pharmacie_id uuid references public.pharmacies(id) on delete set null;
alter table public.ordonnances add column envoyee_le timestamptz;
alter table public.ordonnances add column envoyee_a uuid references public.pharmacies(id) on delete set null;

-- =====================================================================
-- Novembre 2026 : suppression de la validation par une collègue.
-- La fonction lignes_controle() date chaque changement (modifie_le, modifie_par)
-- et le marque validé par son auteur. Voir la base pour la version en vigueur.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Ordonnances scannées sur plusieurs pages (migration ordonnances_pages_supplementaires)
-- photo_path = page 1 (lue par la reconnaissance), pages_sup = pages suivantes
-- ---------------------------------------------------------------------
alter table public.ordonnances add column if not exists pages_sup text[] not null default '{}';

-- ---------------------------------------------------------------------
-- Temps réel (migration temps_reel_tables_cabinet) : les changements des collègues arrivent en direct
-- ---------------------------------------------------------------------
alter publication supabase_realtime add table public.patients, public.lignes, public.ordonnances, public.pharmacies, public.membres;

-- ---------------------------------------------------------------------
-- Suivi des sauvegardes complètes (migration suivi_sauvegardes)
-- ---------------------------------------------------------------------
alter table public.reglages add column if not exists derniere_sauvegarde timestamptz;
alter table public.reglages add column if not exists sauvegarde_par uuid;
-- fonctions noter_sauvegarde() et etat_sauvegarde() : security definer, réservées aux membres

-- ---------------------------------------------------------------------
-- Envois par e-mail ou SMS, avec leur auteur (migration envois_sms_et_auteur)
-- ---------------------------------------------------------------------
alter table public.ordonnances add column if not exists envoyee_par uuid;
alter table public.ordonnances add column if not exists envoyee_via text check (envoyee_via in ('email', 'sms'));
alter table public.pharmacies add column if not exists sms text;
