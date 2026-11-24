# Digital Twin WebSocket (wss://api.skynex.best/ws/twin). Included from the TLS server block of vista-api-public.conf.
# The Twin container listens on 127.0.0.1:8767 only; this is its sole public path. Viewers authenticate with a 60 s HMAC scope in the
# WebSocket subprotocol (checked by the Twin), so nginx adds no credential handling.
location /ws/ {
    proxy_pass http://127.0.0.1:8767;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_read_timeout 3600s;
    proxy_send_timeout 3600s;
    proxy_buffering off;
}
