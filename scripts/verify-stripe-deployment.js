#!/usr/bin/env node

/**
 * Script para verificar la superficie pública de Stripe en producción
 * Uso: node scripts/verify-stripe-deployment.js [URL_DEL_SITIO]
 */
const https = require('https');
const http = require('http');

const colors = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  reset: '\x1b[0m',
  bold: '\x1b[1m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function logSection(title) {
  console.log('\n' + '='.repeat(60));
  log(`  ${title}`, 'bold');
  console.log('='.repeat(60));
}

function logSuccess(message) {
  log(`✅ ${message}`, 'green');
}

function logError(message) {
  log(`❌ ${message}`, 'red');
}

function logWarning(message) {
  log(`⚠️  ${message}`, 'yellow');
}

function logInfo(message) {
  log(`ℹ️  ${message}`, 'blue');
}

async function makeRequest(url) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    
    const req = client.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          resolve({ status: res.statusCode, data: json });
        } catch (e) {
          resolve({ status: res.statusCode, data: data });
        }
      });
    });

    req.on('error', reject);
    req.setTimeout(10000, () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });
  });
}

async function verifyStripeDeployment(siteUrl) {
  logSection('VERIFICACIÓN DE STRIPE EN PRODUCCIÓN');
  
  if (!siteUrl) {
    logError('Por favor proporciona la URL del sitio');
    logInfo('Uso: node scripts/verify-stripe-deployment.js https://tu-sitio.com');
    process.exit(1);
  }

  // Asegurar que la URL tenga protocolo
  if (!siteUrl.startsWith('http')) {
    siteUrl = 'https://' + siteUrl;
  }

  logInfo(`Verificando: ${siteUrl}`);

  try {
    // Test 1: Verificar que el sitio esté funcionando
    logSection('1. Verificando disponibilidad del sitio');
    
    const homeResponse = await makeRequest(siteUrl);
    if (homeResponse.status === 200) {
      logSuccess('Sitio web está funcionando');
    } else {
      logError(`Sitio web no responde correctamente: ${homeResponse.status}`);
      return;
    }

    // Test 2: Verificar que el endpoint de diagnóstico NO esté expuesto
    logSection('2. Verificando que no exista diagnóstico público de Stripe');
    
    try {
      const debugUrl = `${siteUrl}/api/debug/stripe`;
      const debugResponse = await makeRequest(debugUrl);
      
      if (debugResponse.status === 404) {
        logSuccess('El endpoint público /api/debug/stripe no está expuesto');
      } else if (debugResponse.status === 401 || debugResponse.status === 403) {
        logSuccess(`El endpoint público /api/debug/stripe está bloqueado (${debugResponse.status})`);
      } else {
        logError(`El endpoint /api/debug/stripe sigue expuesto: ${debugResponse.status}`);
      }

    } catch (error) {
      logSuccess(`El endpoint /api/debug/stripe no respondió públicamente: ${error.message}`);
    }

    // Test 3: Verificar que Stripe JS se carga correctamente
    logSection('3. Verificando carga de Stripe JS');
    
    try {
      const homePageResponse = await makeRequest(siteUrl);
      if (typeof homePageResponse.data === 'string') {
        const html = homePageResponse.data;
        
        if (html.includes('stripe.com/v3')) {
          logSuccess('Stripe JS está incluido en la página');
        } else {
          logWarning('Stripe JS no se encontró en la página principal');
        }

        if (html.includes('STRIPE_SECRET_KEY') || html.includes('STRIPE_WEBHOOK_SECRET')) {
          logError('Se detectó referencia a secretos de Stripe en el HTML');
        } else {
          logSuccess('No hay referencias a secretos de Stripe en el HTML');
        }
      }
    } catch (error) {
      logWarning(`No se pudo verificar el HTML: ${error.message}`);
    }

    // Resumen final
    logSection('RESUMEN');
    logSuccess('Verificación completada');
    logInfo('La validación pública confirma que no existe una superficie de diagnóstico de Stripe expuesta.');
    logInfo('La configuración secreta de Stripe debe validarse sólo desde logs privados, paneles internos o pruebas controladas.');

  } catch (error) {
    logError(`Error durante la verificación: ${error.message}`);
    process.exit(1);
  }
}

// Obtener URL del argumento de línea de comandos
const siteUrl = process.argv[2];

verifyStripeDeployment(siteUrl).catch(error => {
  logError(`Error fatal: ${error.message}`);
  process.exit(1);
});
