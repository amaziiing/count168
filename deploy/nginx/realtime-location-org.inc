    # count168.org only — Transaction Payment SSE (services/tx-realtime -> 127.0.0.1:3912)
    # site (.site) uses port 3911 + tx-realtime.service — do not mix.
    location ^~ /realtime/ {
        proxy_pass http://127.0.0.1:3912/;
        proxy_http_version 1.1;
        proxy_set_header Connection "";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_buffering off;
        proxy_cache off;
        proxy_read_timeout 3600s;
        chunked_transfer_encoding off;
    }
