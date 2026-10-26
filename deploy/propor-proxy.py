from pathlib import Path
import hashlib
current=Path('/opt/tio-v2/proxy/Caddyfile')
before=current.read_text()
if '\nchamaotio.com' in before or '\nwww.chamaotio.com' in before:
    raise SystemExit('O host ja tem configuracao; revisar antes de propor.')
addition='''

# Institucional Tio v2 — aplicar somente na virada autorizada.
www.chamaotio.com {
    redir https://chamaotio.com{uri} 308
}
chamaotio.com {
    request_body {
        max_size 40MB
    }
    reverse_proxy tio-institucional-v2:8080
}
'''
base=Path('/opt/tio-v2/institucional')
(base/'Caddyfile.candidato').write_text(before+addition)
(base/'Caddyfile.original').write_text(before)
(base/'proxy-original.sha256').write_text(hashlib.sha256(before.encode()).hexdigest()+'\n')
print('Candidato preparado; proxy ativo nao alterado.')
