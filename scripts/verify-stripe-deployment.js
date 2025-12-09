#!/usr/bin/env node

/**
 * Script para verificar la configuración de Stripe en producción
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

    // Test 2: Verificar endpoint de diagnóstico de Stripe
    logSection('2. Verificando configuración de Stripe');
    
    try {
      const debugUrl = `${siteUrl}/api/debug/stripe`;
      const debugResponse = await makeRequest(debugUrl);
      
      if (debugResponse.status === 200) {
        logSuccess('Endpoint de diagnóstico de Stripe está funcionando');
        
        const diagnostics = debugResponse.data;
        
        // Verificar variables de entorno
        logInfo('Variables de entorno:');
        
        const publishableKey = diagnostics.variables.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
        if (publishableKey.exists && publishableKey.format === 'valid') {
          logSuccess(`NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: ${publishableKey.preview}`);
        } else {
          logError(`NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: ${publishableKey.exists ? 'Formato inválido' : 'No encontrada'}`);
        }

        const secretKey = diagnostics.variables.STRIPE_SECRET_KEY;
        if (secretKey.exists && secretKey.format === 'valid') {
          logSuccess(`STRIPE_SECRET_KEY: ${secretKey.preview}`);
        } else {
          logError(`STRIPE_SECRET_KEY: ${secretKey.exists ? 'Formato inválido' : 'No encontrada'}`);
        }

        const webhookSecret = diagnostics.variables.STRIPE_WEBHOOK_SECRET;
        if (webhookSecret.exists && webhookSecret.format === 'valid') {
          logSuccess(`STRIPE_WEBHOOK_SECRET: ${webhookSecret.preview}`);
        } else {
          logError(`STRIPE_WEBHOOK_SECRET: ${webhookSecret.exists ? 'Formato inválido' : 'No encontrada'}`);
        }

        // Mostrar recomendaciones
        if (diagnostics.recommendations.length > 0) {
          logSection('3. Recomendaciones');
          diagnostics.recommendations.forEach(rec => {
            logWarning(rec);
          });
        } else {
          logSuccess('Configuración de Stripe parece correcta');
        }

      } else if (debugResponse.status === 401) {
        logWarning('Endpoint de diagnóstico requiere autenticación');
        logInfo('Esto es normal en producción. Verifica manualmente las variables de entorno.');
      } else {
        logError(`Endpoint de diagnóstico no disponible: ${debugResponse.status}`);
      }

    } catch (error) {
      logWarning(`No se pudo acceder al endpoint de diagnóstico: ${error.message}`);
      logInfo('Esto puede ser normal si el endpoint está protegido en producción');
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

        if (html.includes('NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY')) {
          logWarning('Variable de entorno visible en el HTML (esto no debería pasar)');
        } else {
          logSuccess('Variables de entorno no están expuestas en el HTML');
        }
      }
    } catch (error) {
      logWarning(`No se pudo verificar el HTML: ${error.message}`);
    }

    // Resumen final
    logSection('RESUMEN');
    logSuccess('Verificación completada');
    logInfo('Si todos los tests pasaron, tu configuración de Stripe debería funcionar correctamente.');
    logInfo('Si hay problemas, revisa las recomendaciones anteriores.');

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
