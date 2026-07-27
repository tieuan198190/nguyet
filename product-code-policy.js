(function(root) {
  'use strict';

  const CLOSED_A_CODE_MESSAGE = 'Mã này đã đóng vào bao, không live được';

  const LIVE_ALLOWED_A_CODES = Object.freeze([
    'A346', 'A366', 'A484', 'A494', 'A495', 'A530', 'A539', 'A546', 'A549', 'A558',
    'A607', 'A655', 'A661', 'A668', 'A684', 'A699', 'A703', 'A710', 'A711', 'A716',
    'A735', 'A736', 'A737', 'A772', 'A773', 'A774', 'A776', 'A779', 'A780', 'A782',
    'A783', 'A784', 'A785', 'A787', 'A791', 'A792', 'A793', 'A794', 'A795', 'A797',
    'A798', 'A800', 'A801', 'A802', 'A803', 'A805', 'A806', 'A807', 'A808', 'A817',
    'A818', 'A819', 'A824', 'A825', 'A826', 'A827', 'A828', 'A829', 'A830', 'A831',
    'A832', 'A833', 'A834', 'A835', 'A852', 'A853', 'A854', 'A855', 'A856', 'A857',
    'A858', 'A859', 'A864', 'A865', 'A866', 'A867', 'A868', 'A869', 'A872', 'A873',
    'A874', 'A875', 'A876', 'A877', 'A878', 'A879', 'A880', 'A887', 'A889', 'A890',
    'A900', 'A901', 'A902', 'A903', 'A904', 'A905', 'A906', 'A907', 'A908', 'A909',
    'A910', 'A911', 'A912', 'A913', 'A914', 'A915', 'A916', 'A917', 'A918', 'A920',
    'A930', 'A931', 'A932', 'A933', 'A934', 'A935', 'A936', 'A937', 'A938', 'A939',
    'A940', 'A941', 'A942', 'A943', 'A944', 'A945', 'A946', 'A953', 'A954', 'A960',
    'A961', 'A962', 'A963', 'A964', 'A965', 'A966', 'A967', 'A968', 'A979', 'A980',
    'A981', 'A982', 'A983', 'A985', 'A986', 'A987', 'A988', 'A989', 'A990', 'A991',
    'A992', 'A993', 'A994', 'A995', 'A996', 'A997'
  ]);
  const liveAllowedACodeSet = new Set(LIVE_ALLOWED_A_CODES);

  function getProductCodeRestriction(productCode) {
    const normalizedCode = String(productCode || '').trim().toUpperCase();

    if (normalizedCode.startsWith('A') && !liveAllowedACodeSet.has(normalizedCode)) {
      return CLOSED_A_CODE_MESSAGE;
    }

    return null;
  }

  const productCodePolicy = Object.freeze({
    CLOSED_A_CODE_MESSAGE,
    LIVE_ALLOWED_A_CODES,
    getProductCodeRestriction
  });

  if (root) {
    root.productCodePolicy = productCodePolicy;
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = productCodePolicy;
  }
})(typeof window !== 'undefined' ? window : null);
