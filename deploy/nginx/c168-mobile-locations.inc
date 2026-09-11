# C168 Mobile SPA — include inside count168.org / count168.site server { }
# Install: sudo cp .../c168-mobile-locations.inc /etc/nginx/snippets/c168-mobile-locations.inc
# Then: include /etc/nginx/snippets/c168-mobile-locations.inc;

location ^~ /c168_mobile/frontend/dist/assets/ {
    expires 1y;
    add_header Cache-Control "public, immutable";
    access_log off;
    try_files $uri =404;
}

location = /c168_mobile/frontend/dist/index.html {
    add_header Cache-Control "no-cache";
    try_files $uri =404;
}

location = /c168_mobile {
    return 302 /c168_mobile/login;
}

location ~ "^/c168_mobile/(login|dashboard|home|member|report|transaction|account|maintenance|more|reset-password|owner-secondary-password|user-secondary-password)(/.*)?$" {
    add_header Cache-Control "no-cache";
    try_files /c168_mobile/frontend/dist/index.html =404;
}
