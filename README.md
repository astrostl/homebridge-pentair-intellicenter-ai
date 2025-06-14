# Homebridge Pentair Intellicenter
[![NPM Version](https://img.shields.io/npm/v/homebridge-pentair-intellicenter-ai.svg)](https://www.npmjs.com/package/homebridge-pentair-intellicenter-ai)

This is a plugin to integrate your Pentair IntelliCenter [1.064+](https://www.pentair.com/en-us/education-support/residential/product-support/pentair-pool-and-spa-software-downloads/intellicenter-download.html) setup with Homebridge (in order to integrate it with Apple Home and Siri via Apple HomeKit). It exposes bodies, heaters, and circuits *marked as features* by default.

## Development and Testing

This is a fork of Windscar/homebridge-pentair-intellicenter, which itself is a fork of dustindclark/homebridge-pentair-intellicenter. dustindclark's original seems to have not been actively maintained since 2023. Windscar forked it and made a few updates, but has issues disabled and didn't promptly accepted my pull requests. With great gratitude to both of them, I'm breaking this out into a repository that "I" can actively maintain.

**All code is AI-generated (currently Claude Code) and directed, overseen, and tested by me. If running stuff from the internet scared you, this might horrify you.**

I have all of the security doodads GitHub offers (dependency updates, code scans, etc.) enabled. I've cleared all issues, and aim to keep them clear.

I have a dual-body setup with a pool (IntelliFlo VSF pump, cleaner pump, heat pump, lights, and fountain feature) and spa (IntelliFlo VS pump, air blower, gas heater, lights). All testing is done on that using firmware 3.004+.

## Installation

Install this plugin using the Homebridge UI or via npm:

```bash
npm install -g homebridge-pentair-intellicenter-ai
```

Pump speed can be optionally controlled like a Fan controller. This requires that circuits or bodies
be attached to a pump setting in IntelliCenter and for the configuration option to be enabled. The rotation speed maps to IntelliCenter's min/max speed or
flow settings. For example, if IntelliCenter's min RPM is 1,000 and the max is 3,400, the circuits speed settings
will map as follows:

- 0%: 1,000 RPMs
- 50%: 1,700 RPMs
- 100%: 3,400 RPMs

> :warning: **Your installer may have configured you min RPMs too low for flow**
> It is highly recommended that you check double check your pump configuration to avoid pump damage.
> Adjusting RPMs using the fan setting may also overwrite your previous RPM settings.

Also, along with the [Homebridge Alexa plugin](https://github.com/NorthernMan54/homebridge-alexa), this plugin can be used to expose your IntelliCenter circuits to Alexa. As far as I know, this is currently the only Alexa integration as the Alexa skill for IntelliCenter is no longer available.

## Troubleshooting
- __Connection Errors__
  - Try first rebooting your IntelliCenter panel, then reboot Homebridge.
  - Ensure your IntelliCenter has a DHCP reservation or static IP address.
