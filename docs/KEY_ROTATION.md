# Key rotation

> Edge-server material. This document describes the Raspberry Pi and Python backend track, which lives in the separate AgriEdge edge repository. It is kept here for reference; the mobile app in this repository does not use a server.

Device session key (`jwt_ed25519.pem`): delete the file and restart; every session ends and users sign in again. A new key is only created in dev mode, so on real devices re-run provisioning steps for the key only, or restore from the image build process.

Release signing key (offline): generate with `python -m scripts.sign keygen --out <dir>`, back it up in two places, and never commit it. To rotate, ship a new public key in a bundle signed by the old key, then retire the old key. Bump the bundle version counter so older bundles cannot be replayed.

Database key (`db.key`): rotating requires `PRAGMA rekey` with SQLCipher while the service is stopped. Procedure to be scripted and tested before release.
