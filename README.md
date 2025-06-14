
> :warning: **Current versions of this plugin only works with IntelliCenter version 1.064 and higher.**
> If you are on an older version of IntelliCenter firmware, it is recommended that you
> [upgrade your IntelliCenter firmware](https://www.pentair.com/en-us/education-support/residential/product-support/pentair-pool-and-spa-software-downloads/intellicenter-download.html) (provided that you accept the risks).

This is a fork of Windscar/homebridge-pentair-intellicenter, which itself is a fork of dustindclark/homebridge-pentair-intellicenter. dustindclark's original seems to have not been actively maintained since 2023. Windscar forked it and made a few updates, but has Issues disabled and hasn't promptly accepted my Pull Requests. With great gratitude to both of them, I'm breaking this out into a repository that "I" can actively maintain. I've enabled all of the security doodads GitHub offers and resolve all of them.

Critically: I am using AI (currently Claude Code) to generate all changes. If running stuff off of the internet scared you, this should horrify you. I am testing the changes locally and dogfooding it with my own setup, but provide zero warranty or guarantee for any of it.

# Homebridge Pentair IntelliCenter AI Plugin
[![NPM Version](https://img.shields.io/npm/v/homebridge-pentair-intellicenter-ai.svg)](https://www.npmjs.com/package/homebridge-pentair-intellicenter-ai)

This plugin integrates with the Pentair IntelliCenter panel to expose its features to HomeKit/Siri.
It connects directly to your IntelliCenter panel, so using a separate pool controller (i.e. nodejs-poolController)
is not required. By design, only the "Bodies", heaters, and circuits that are marked as "Features" in IntelliCenter
will be exposed as switches in HomeKit. This avoids unnecessary/redundant HomeKit configuration.

## Installation

Install this plugin using the Homebridge UI or via npm:

```bash
npm install -g homebridge-pentair-intellicenter-ai
```

As of version 2.1.0, pump speed can be controlled like a Fan controller. This requires that circuits or bodies
be attached to a pump setting in IntelliCenter. The rotation speed maps to IntelliCenter's min/max speed or
flow settings. For example, if IntelliCenter's min RPM is 1,000 and the max is 3,400, the circuits speed settings
will map as follows:

- 0%: 1,000 RPMs
- 50%: 1,700 RPMs
- 100%: 3,400 RPMs

> :warning: **Your installer may have configured you min RPMs too low for flow**
> It is highly recommended that you check double check your pump configuration to avoid pump damage.

Also, along with the [Homebridge Alexa plugin](https://github.com/NorthernMan54/homebridge-alexa), this plugin can be used to expose your IntelliCenter circuits to Alexa. As far as I know, this is currently the only Alexa integration as the Alexa skill for IntelliCenter is no longer available.

## Troubleshooting
- __Connection Errors__
  - Try first rebooting your IntelliCenter panel, then reboot Homebridge.
  - Ensure your IntelliCenter has a DHCP reservation or static IP address.
