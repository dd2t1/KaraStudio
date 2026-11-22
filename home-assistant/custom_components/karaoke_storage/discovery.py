"""Discover karaoke web servers advertised over mDNS on the local network."""
from ipaddress import ip_address
from zeroconf import IPVersion, ServiceStateChange
from zeroconf.asyncio import AsyncServiceBrowser, AsyncServiceInfo
from homeassistant.components.zeroconf import async_get_async_instance
from homeassistant.const import EVENT_HOMEASSISTANT_STOP

SERVICE = "_karaoke._tcp.local."


def candidates(info):
    if info.properties.get(b"app") != b"karaoke-react" or not 0 < info.port < 65536:
        return []
    result = []
    for host in info.parsed_addresses(IPVersion.V4Only):
        address = ip_address(host)
        if address.is_loopback or address.is_unspecified or address.is_multicast or not address.is_private:
            continue
        result.append({"name": info.name.removesuffix("." + SERVICE), "url": f"http://{host}:{info.port}/"})
    return result


async def async_start_discovery(hass):
    discovered = hass.data.setdefault("karaoke_storage_discovered", {})
    zc = await async_get_async_instance(hass)
    generations = {}

    async def update(service_type, name, state_change):
        version = generations[name] = generations.get(name, 0) + 1
        if state_change == ServiceStateChange.Removed:
            discovered.pop(name, None)
            return
        info = AsyncServiceInfo(service_type, name)
        if await info.async_request(zc.zeroconf, 3000) and generations.get(name) == version:
            discovered[name] = candidates(info)

    def changed(zeroconf, service_type, name, state_change):
        hass.add_job(update, service_type, name, state_change)

    browser = AsyncServiceBrowser(zc.zeroconf, SERVICE, handlers=[changed])
    async def stop(event):
        await browser.async_cancel()
    hass.bus.async_listen_once(EVENT_HOMEASSISTANT_STOP, stop)
