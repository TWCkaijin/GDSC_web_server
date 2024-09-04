var admin = require("firebase-admin");

var serviceAccount = require("./firebase_admin_config.json");

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: "https://gdsc-web-2d5fa.firebaseio.com"
});


module.exports = admin;