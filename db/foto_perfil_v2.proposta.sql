BEGIN;
CREATE OR REPLACE FUNCTION api.app_foto_perfil_contexto(p_sessao_token text) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT coalesce((SELECT jsonb_build_object('ok',true,'usuario_id',u.id) FROM core.sessoes s JOIN core.usuarios u ON u.id=s.usuario_id WHERE s.token_hash=encode(sha256(convert_to(coalesce(p_sessao_token,''),'UTF8')),'hex') AND s.revogada_em IS NULL AND s.expira_em>now()),jsonb_build_object('ok',false))
$$;
CREATE OR REPLACE FUNCTION api.app_foto_perfil_salvar(p_sessao_token text,p_foto_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE context jsonb:=api.app_foto_perfil_contexto(p_sessao_token); uid uuid; uri text;
BEGIN
 IF context->>'ok'<>'true' OR p_foto_id IS NULL THEN RETURN jsonb_build_object('ok',false);END IF;
 uid:=(context->>'usuario_id')::uuid;
 uri:='https://chamaotio.com/media/perfis/'||uid::text||'/'||p_foto_id::text||'.jpg';
 UPDATE core.usuarios SET foto_url=uri WHERE id=uid;
 RETURN jsonb_build_object('ok',true,'public_url',uri);
END $$;
-- Publica apenas o avatar atual, cujo caminho é controlado pelo backend.
-- Documentos de cadastro e fotos antigas não são expostos por esta função.
CREATE OR REPLACE FUNCTION api.app_foto_perfil_publica(p_usuario_id uuid,p_foto_id uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT CASE WHEN EXISTS(SELECT 1 FROM core.usuarios u WHERE u.id=p_usuario_id AND u.foto_url='https://chamaotio.com/media/perfis/'||p_usuario_id::text||'/'||p_foto_id::text||'.jpg') THEN jsonb_build_object('ok',true,'path','perfis/'||p_usuario_id::text||'/'||p_foto_id::text||'.jpg') ELSE jsonb_build_object('ok',false) END
$$;
REVOKE ALL ON FUNCTION api.app_foto_perfil_contexto(text),api.app_foto_perfil_salvar(text,uuid),api.app_foto_perfil_publica(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION api.app_foto_perfil_contexto(text),api.app_foto_perfil_salvar(text,uuid),api.app_foto_perfil_publica(uuid,uuid) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
