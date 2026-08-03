FROM nginx:alpine
COPY index.html /usr/share/nginx/html/index.html
COPY logo-oficial.png /usr/share/nginx/html/logo-oficial.png
COPY hero-bg.jpg /usr/share/nginx/html/hero-bg.jpg
EXPOSE 80
