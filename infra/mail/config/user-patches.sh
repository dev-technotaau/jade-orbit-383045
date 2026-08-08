#!/bin/bash
# Run after all services are initialized
# Wait for opendkim to start and TrustedHosts to be created
sleep 10
echo '0.0.0.0/0' >> /etc/opendkim/TrustedHosts
supervisorctl restart opendkim
