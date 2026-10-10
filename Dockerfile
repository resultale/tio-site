FROM nginx:alpine
COPY index.html /usr/share/nginx/html/index.html
COPY styles.css app.js logo-transparente.png /usr/share/nginx/html/
COPY cadastro-motorista /usr/share/nginx/html/cadastro-motorista
COPY cadastro-negocio /usr/share/nginx/html/cadastro-negocio
COPY privacidade /usr/share/nginx/html/privacidade
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY logo-oficial.png /usr/share/nginx/html/logo-oficial.png
COPY hero-bg.jpg /usr/share/nginx/html/hero-bg.jpg
EXPOSE 80
