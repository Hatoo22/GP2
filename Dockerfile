FROM php:8.3-apache

RUN docker-php-ext-install mysqli

RUN a2dismod mpm_event mpm_worker || true \
    && a2enmod mpm_prefork rewrite

RUN echo "=== ENABLED MPM MODULES ===" && ls -la /etc/apache2/mods-enabled/*mpm*

COPY . /var/www/html/

RUN chown -R www-data:www-data /var/www/html

EXPOSE 80
CMD ["bash", "-c", "echo '=== RUNTIME MPM FILES ==='; ls -la /etc/apache2/mods-enabled/*mpm*; echo '=== APACHE ENV ==='; env | grep -i apache || true; apache2-foreground"]
