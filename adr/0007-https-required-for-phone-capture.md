# HTTPS required for phone capture

The phone capture client must be developed and tested over a secure browser context, even for local use. Camera access through `getUserMedia` is restricted to secure contexts; an iPhone joining a Mac-hosted local app over plain `http://<mac-ip>` should be treated as unsupported. Development setup should use Cloudflare Tunnel as the first local HTTPS path for iPhone testing, with a trusted local certificate as a fallback when fully local networking is preferred.
