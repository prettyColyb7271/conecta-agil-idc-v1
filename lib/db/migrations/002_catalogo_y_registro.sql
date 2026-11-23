ALTER TABLE requirement_catalog ADD COLUMN tipo TEXT CHECK (tipo IN ('carga', 'carga_sensible', 'carga_multiple', 'generado', 'externo', 'dato_estructurado'));
ALTER TABLE requirement_catalog ADD COLUMN integra TEXT CHECK (integra IN ('IDC', 'Cliente', 'IDC/Cliente', 'Cliente/IDC'));
ALTER TABLE requirement_catalog ADD COLUMN formato_code TEXT CHECK (formato_code IS NULL OR formato_code IN ('F-01', 'F-02', 'F-03', 'F-04', 'F-05', 'F-06'));
ALTER TABLE requirement_catalog ADD COLUMN firma_fisica TEXT;
ALTER TABLE requirement_catalog ADD COLUMN sensible INTEGER CHECK (sensible IN (0, 1));
ALTER TABLE requirement_catalog ADD COLUMN reutiliza_code TEXT;
ALTER TABLE requirement_catalog ADD COLUMN condicional TEXT;
ALTER TABLE requirement_catalog ADD COLUMN validaciones TEXT;

ALTER TABLE account_requests ADD COLUMN user_id TEXT REFERENCES users(id);
ALTER TABLE account_requests ADD COLUMN requested_role TEXT CHECK (requested_role IN ('cliente', 'gestor_tramites_cfe', 'coordinador_idc', 'admin_seguridad'));

CREATE INDEX IF NOT EXISTS idx_account_requests_user_id ON account_requests(user_id);
