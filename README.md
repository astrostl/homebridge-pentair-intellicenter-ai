***All code is AI-generated (currently Claude Code) and directed, overseen, and tested by me. If running stuff from the internet scared you, this might horrify you.**
***Provided strictly as-is with no warranty, guarantee, etc.***

# Homebridge Pentair IntelliCenter
[![NPM Version](https://img.shields.io/npm/v/homebridge-pentair-intellicenter-ai.svg)](https://www.npmjs.com/package/homebridge-pentair-intellicenter-ai) [![verified-by-homebridge](https://badgen.net/badge/homebridge/verified/purple)](https://github.com/homebridge/homebridge/wiki/Verified-Plugins)

This is a plugin to integrate your [Pentair IntelliCenter](https://www.pentair.com/en-us/products/residential/pool-spa-equipment/pool-automation/intellicenter-control-system.html) ([1.064+](https://www.pentair.com/en-us/education-support/residential/product-support/pentair-pool-and-spa-software-downloads/intellicenter-download.html)) setup with [Homebridge](https://homebridge.io) (in order to integrate it with [Apple Home](https://www.apple.com/home-app/) and [Siri](https://www.apple.com/siri/)).

If you like this sort of thing, you might also be interested in ["Pentameter"](https://github.com/astrostl/pentameter). It polls, logs, and creates a visual dashboard for your Pentair IntelliCenter setup! A Docker Compose file is provided for one-command deployment.

## Development and Testing

This is a fork of [Windscar/homebridge-pentair-intellicenter](https://github.com/Windscar/homebridge-pentair-intellicenter), which itself is a fork of [dustindclark/homebridge-pentair-intellicenter](https://github.com/dustindclark/homebridge-pentair-intellicenter). dustindclark's original seems to have not been actively maintained since 2023. Windscar forked it and made a few updates, but has issues disabled and doesn't seem to accept pull requests. With great gratitude to both of them, I'm breaking this out into a repository that "I"* can actively maintain.

I have all of the security doodads GitHub offers (dependency updates, code scans, etc.) enabled. I've cleared all issues, and aim to keep them clear.

I have a dual-body setup with a pool (IntelliFlo VSF pump, cleaner pump, heat pump, lights, and fountain feature) and spa (IntelliFlo VS pump, air blower, gas heater, lights). All testing is done on that using firmware 3.004+ (actively maintained and tested).

## Features and Functionality

Exposes all bodies, all features, and any circuits *marked as features in IntelliCenter*. Knows power curves for VF and VSF pumps and exposes virtual lights to report RPMs (actual), watts (estimated), and GPM (estimated on VSF only).

## Configuration Options

Yes, you need your local IP for now. If you enable the option to show VSPs they will expose as a fan that you can use to adjust between your system-configured min/max. It might also blow away your system-configured RPM settings. I consider this feature especially risky and personally disable it. Outside air temp is hopefully straightforward. There is also an option to expose all circuits — while tempting, doing this results in dozens of things getting exposed in Apple Home for me and I only use it for debugging.

## Roadmap

- **Switch from telnet to WebSockets for connection improvements**: This is feasible, just needs to be executed.
- **Implement IP autodetection**: This is also feasible, and also just needs to be executed.
- **Look into a Go backend**: Not sure if this is feasible, but I'd like to massively reduce JS dependencies even while using HomeBridge.
