"""Create a unique Musike LAN TLS certificate for the local PC only.
Private key never enters Git or an APK; only the public cert is trusted by
the locally built Android APK.
"""
from datetime import datetime, timedelta, timezone
from pathlib import Path
import ipaddress,os,ssl
from cryptography import x509
from cryptography.hazmat.primitives import hashes,serialization
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.x509.oid import NameOID,ExtendedKeyUsageOID

IP=ipaddress.ip_address(os.environ.get("MUSIKE_LAN_IP","192.168.0.41"))
assert IP.is_private
folder=Path(os.environ["APPDATA"])/"Musike"/"data"/"lan-bridge"
folder.mkdir(parents=True,exist_ok=True)
crt=folder/"peer-lan.crt";key=folder/"peer-lan.key"
if crt.exists()!=key.exists():raise RuntimeError("Incomplete TLS identity; refusing to overwrite.")
if crt.exists():
 existing=x509.load_pem_x509_certificate(crt.read_bytes())
 existing.extensions.get_extension_for_class(x509.SubjectAlternativeName).value.get_values_for_type(x509.IPAddress)
 assert IP in existing.extensions.get_extension_for_class(x509.SubjectAlternativeName).value.get_values_for_type(x509.IPAddress), "Certificate does not cover current LAN IP"
 print("EXISTING_CERT",crt)
else:
 priv=ec.generate_private_key(ec.SECP256R1())
 now=datetime.now(timezone.utc)
 subject=x509.Name([x509.NameAttribute(NameOID.COMMON_NAME,"Musike LAN Music")])
 cert=(x509.CertificateBuilder().subject_name(subject).issuer_name(subject)
   .public_key(priv.public_key()).serial_number(x509.random_serial_number())
   .not_valid_before(now-timedelta(days=1)).not_valid_after(now+timedelta(days=825))
   .add_extension(x509.SubjectAlternativeName([x509.IPAddress(IP)]),critical=False)
   .add_extension(x509.BasicConstraints(ca=True,path_length=0),critical=True)
   .add_extension(x509.KeyUsage(digital_signature=True,content_commitment=False,key_encipherment=False,data_encipherment=False,
     key_agreement=False,key_cert_sign=True,crl_sign=False,encipher_only=False,decipher_only=False),critical=True)
   .add_extension(x509.ExtendedKeyUsage([ExtendedKeyUsageOID.SERVER_AUTH]),critical=False)
   .sign(priv,hashes.SHA256()))
 crt.write_bytes(cert.public_bytes(serialization.Encoding.PEM))
 key.write_bytes(priv.private_bytes(serialization.Encoding.PEM,serialization.PrivateFormat.PKCS8,serialization.NoEncryption()))
 print("CREATED_CERT",crt)
print("CERT_SHA256",existing.fingerprint(hashes.SHA256()).hex() if crt.exists() and 'existing' in locals() else cert.fingerprint(hashes.SHA256()).hex())
print("KEY_REMAINS_LOCAL",key)
