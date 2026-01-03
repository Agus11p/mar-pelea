// --- CONFIGURACIÓN REAL DE FIREBASE ---
const firebaseConfig = {
    apiKey: "AIzaSyDAhf9VkqBVNLgqiOukkyUhSbvudQs7Ikc",
    authDomain: "mar-pelea.firebaseapp.com",
    databaseURL: "https://mar-pelea-default-rtdb.firebaseio.com/",
    projectId: "mar-pelea",
    storageBucket: "mar-pelea.firebasestorage.app",
    messagingSenderId: "911160734196",
    appId: "1:911160734196:web:6de7bb2710f7fbb9c889a1",
    measurementId: "G-Q683RJMGES"
};

// Inicializar Firebase (Modo Compatibilidad Web)
firebase.initializeApp(firebaseConfig);

// Inicializar servicios
const db = firebase.database(); // Base de datos Realtime
const auth = firebase.auth();   // Autenticación
