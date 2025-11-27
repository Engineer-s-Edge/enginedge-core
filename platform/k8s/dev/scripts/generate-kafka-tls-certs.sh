#!/bin/bash
# Generate self-signed TLS certificates for Kafka

set -e

CERT_DIR="$(dirname "$0")/../secrets/kafka-tls-certs"
mkdir -p "$CERT_DIR"

# Generate CA key and certificate
openssl req -new -x509 -keyout "$CERT_DIR/ca-key" -out "$CERT_DIR/ca-cert" -days 365 \
  -subj "/CN=Kafka-CA" -nodes

# Generate keystore for each broker (kafka-0, kafka-1)
for i in 0 1; do
  BROKER_NAME="kafka-$i"
  BROKER_FQDN="$BROKER_NAME.kafka.default.svc.cluster.local"
  
  # Generate key and certificate request
  openssl req -new -keyout "$CERT_DIR/$BROKER_NAME-key" -out "$CERT_DIR/$BROKER_NAME.csr" \
    -subj "/CN=$BROKER_FQDN" -nodes
  
  # Sign certificate with CA
  openssl x509 -req -CA "$CERT_DIR/ca-cert" -CAkey "$CERT_DIR/ca-key" \
    -in "$CERT_DIR/$BROKER_NAME.csr" -out "$CERT_DIR/$BROKER_NAME-cert" \
    -days 365 -CAcreateserial
  
  # Create PKCS12 keystore
  openssl pkcs12 -export -in "$CERT_DIR/$BROKER_NAME-cert" \
    -inkey "$CERT_DIR/$BROKER_NAME-key" \
    -out "$CERT_DIR/$BROKER_NAME-keystore.p12" \
    -name kafka-server -password pass:changeit -CAfile "$CERT_DIR/ca-cert" -caname ca
  
  # Create JKS truststore with CA certificate
  keytool -import -trustcacerts -alias ca -file "$CERT_DIR/ca-cert" \
    -keystore "$CERT_DIR/$BROKER_NAME-truststore.jks" \
    -storepass changeit -noprompt
done

# Create truststore for clients
keytool -import -trustcacerts -alias ca -file "$CERT_DIR/ca-cert" \
  -keystore "$CERT_DIR/kafka-client-truststore.jks" \
  -storepass changeit -noprompt

echo "Certificates generated in $CERT_DIR"
echo "Next step: Update kafka-tls-secret.yaml with base64 encoded certificates"

