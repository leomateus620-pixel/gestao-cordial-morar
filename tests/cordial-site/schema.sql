-- Minimal existing Gestão schema, for running the NEW migration in real PostgreSQL/WASM.
-- This is an isolated test database, never a production seed.
CREATE ROLE anon;
CREATE ROLE authenticated;
CREATE ROLE service_role BYPASSRLS;
CREATE SCHEMA auth;
CREATE TABLE auth.users(id uuid PRIMARY KEY);
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
CREATE FUNCTION public.has_role(_user_id uuid,_role text) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT _user_id='00000000-0000-4000-8000-000000000001'::uuid AND _role='admin' $$;
CREATE TABLE public.properties (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),carteira text DEFAULT 'cordial',operacao text DEFAULT 'venda',tipo text,
 codigo_cordial text,codigo_morar text,source text,source_property_id text,is_draft boolean DEFAULT false,exibir_imovel boolean DEFAULT true,autorizacao boolean,disponibilidade text,archived_at timestamptz,removal_state text,
 valor numeric,valor_modo text DEFAULT 'fixo',descricao_imovel text,pontos_fortes text,caracteristicas text[] DEFAULT '{}',cidade text,bairro text,uf text,exibir_endereco_site text DEFAULT 'nao',logradouro text,numero text,
 area_util numeric,area_total numeric,area_construida numeric,area_terreno numeric,area_privativa numeric,area_privativa_unidade text,area_total_unidade text,area_construida_unidade text,area_terreno_unidade text,
 destaque_inicial boolean,estagio_empreendimento text,mobiliado text,revision int DEFAULT 1,updated_at timestamptz DEFAULT now(),created_at timestamptz DEFAULT now(),dormitorios int,banheiros int,suites int,vagas int,permuta boolean,aceita_financiamento boolean,
 proprietario_nome text,proprietario_telefone text,proprietario_email text,observacao_imovel text,outras_informacoes text,localizacao_maps_url text
);
CREATE TABLE public.property_images (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),property_id uuid REFERENCES properties(id) ON DELETE CASCADE,storage_path text,position int DEFAULT 0,is_cover boolean DEFAULT false,processing_status text DEFAULT 'legacy',processed_storage_path text,thumbnail_storage_path text,watermark_variant text,watermark_version text,width int,height int,content_hash text,processed_checksum text,updated_at timestamptz DEFAULT now()
);
CREATE TABLE public.property_provider_publications(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),property_id uuid REFERENCES properties(id),provider text,enabled boolean,status text,external_property_id text,external_reference text,external_public_url text,updated_at timestamptz);
CREATE TABLE public.attendances(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),created_by uuid REFERENCES auth.users(id),imobiliaria text,cliente_nome text,telefone text,email text,contato_preferencial text,origem text,fonte_prospeccao text,finalidade text,tipo_imovel text,status text,pipeline_stage text,prioridade text,imovel_id uuid,imovel_ref text,imovel_codigo text,imovel_descricao text,imovel_bairro text,imovel_cidade text,imovel_tipo text,imovel_valor numeric,interesse_descricao text,historico_inicial text);
GRANT USAGE ON SCHEMA public,auth TO service_role,authenticated,anon;
GRANT ALL ON properties,property_images,property_provider_publications,attendances TO service_role;
INSERT INTO auth.users(id) VALUES('00000000-0000-4000-8000-000000000001'),('00000000-0000-4000-8000-000000000002');
