FROM php:8.3-apache

RUN docker-php-ext-install mysqli

RUN a2dismod mpm_event mpm_worker || true \
    && a2enmod mpm_prefork rewrite

RUN echo "=== ENABLED MPM MODULES ===" && ls -la /etc/apache2/mods-enabled/*mpm*

COPY . /var/www/html/

RUN chown -R www-data:www-data /var/www/html

EXPOSE 80
CMD ["bash", "-c", "rm -f /etc/apache2/mods-enabled/mpm_event.conf /etc/apache2/mods-enabled/mpm_event.load /etc/apache2/mods-enabled/mpm_worker.conf /etc/apache2/mods-enabled/mpm_worker.load && exec apache2-foreground"]
