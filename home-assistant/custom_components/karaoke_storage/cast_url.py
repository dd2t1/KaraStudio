"""Validate the address that the Chromecast itself will open."""
import ipaddress
from urllib.parse import urlsplit
from urllib.parse import parse_qsl, urlencode, urlunsplit


def receiver_url(value):
    parts = urlsplit(validate_page_url(value))
    query = dict(parse_qsl(parts.query, keep_blank_values=True))
    query["cast"] = "1"
    return urlunsplit((parts.scheme, parts.netloc, parts.path, urlencode(query), ""))


def validate_page_url(value):
    if not isinstance(value, str) or not value.strip():
        raise ValueError("Indiquez l’URL de l’application ou configurez app_url dans karaoke_storage.")
    value = value.strip()
    try:
        url = urlsplit(value)
        host = url.hostname
        port = url.port
    except ValueError as error:
        raise ValueError("URL de l’application invalide.") from error
    if url.scheme not in ("http", "https") or not host or url.username is not None or url.password is not None or any(c.isspace() for c in value):
        raise ValueError("Utilisez une URL HTTP(S) sans identifiants, accessible depuis le Chromecast.")
    if port == 0:
        raise ValueError("Port invalide.")
    if host.lower().rstrip(".") == "localhost" or host.lower().rstrip(".").endswith(".localhost"):
        raise ValueError("localhost désigne le Chromecast. Utilisez l’adresse réseau du serveur.")
    try:
        address = ipaddress.ip_address(host)
    except ValueError:
        address = None
    if address and (address.is_loopback or address.is_unspecified or address.is_multicast):
        raise ValueError("Utilisez une adresse réseau joignable depuis le Chromecast.")
    return value
