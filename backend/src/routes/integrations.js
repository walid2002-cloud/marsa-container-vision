const express = require('express');
const router = express.Router();
const { authenticateIntegration } = require('../middleware/integrationAuth');
const { integrationSearch } = require('../controllers/integrationController');

// Évite les 404 bruyants si un client interroge en GET (sonde, bookmark, etc.)
router.get('/integrations/container-search', (req, res) => {
  res.status(405).set('Allow', 'POST').json({
    error:
      'Méthode non autorisée. Utilisez POST avec un corps JSON : ' +
      '{ "container_code": "MSCU1234567", "source": "whatsapp-bot" } ' +
      "et l'en-tête d'authentification intégration.",
  });
});

router.post('/integrations/container-search', authenticateIntegration, integrationSearch);

module.exports = router;
