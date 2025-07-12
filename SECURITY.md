# Security Policy

## Supported Versions

Security updates are provided for the latest published version of this Homebridge plugin. Given the home automation use case and typically low-privilege runtime environment, the security impact is generally limited to local network access.

| Version | Supported          |
| ------- | ------------------ |
| Latest  | :white_check_mark: |
| < Latest| :x:                |

## Reporting a Vulnerability

If you discover a security vulnerability, please follow these steps:

### 🔒 For Sensitive Security Issues

For vulnerabilities that could affect user credentials or network security:
- **Contact**: Create a GitHub issue marked as "security"
- **Response time**: Best effort response
- **Process**: We'll work with you to verify, fix, and coordinate disclosure

### 🐛 For General Security Concerns

For less critical security improvements:
- **GitHub Issues**: Open a public issue with the "security" label
- **Pull Requests**: Security improvements are welcome via PR

## Security Measures

This project includes:
- **Automated dependency scanning** via Dependabot
- **Security audit pipeline** with npm audit and audit-ci
- **Code analysis** with ESLint security plugin  
- **Credential protection** in Docker development environment
- **Supply chain security** monitoring

## Disclosure Policy

- **Verified vulnerabilities** will be fixed promptly
- **Security releases** will be published as patch versions
- **CVE assignment** will be requested for significant vulnerabilities
- **Public disclosure** will be coordinated with reporter

## Home Automation Context

Remember that this is a **home automation plugin** with limited blast radius:
- Runs on local networks (typically Raspberry Pi or NAS)
- Manages pool equipment (not critical infrastructure)
- Standard home security practices apply (network isolation, secure credentials)
