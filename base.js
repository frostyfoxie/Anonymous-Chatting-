// auto-delete.js - Firebase message auto-deletion script
// Add this to your index.html: <script src="auto-delete.js"></script>

// Firebase config (use your existing config)
const firebaseConfig = {
  apiKey: "AIzaSyCqobhf4HFUdBIZJMF-s9uW3e0-EGh327I",
  authDomain: "anonymous-chatting-c6712.firebaseapp.com",
  databaseURL: "https://anonymous-chatting-c6712-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "anonymous-chatting-c6712",
  storageBucket: "anonymous-chatting-c6712.appspot.com",
  messagingSenderId: "124331866043",
  appId: "1:124331866043:web:8be37be9d84974b4a0b69e"
};

// Initialize Firebase if not already initialized
if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
} else {
  firebase.app(); // Use already initialized app
}

const db = firebase.database();

// Function to delete messages older than 1 minute
function deleteOldMessages() {
  const now = Date.now();
  const oneMinuteAgo = now - 10000; // 60 seconds * 1000 ms
  
  // Process groups
  db.ref('groups').once('value').then((groupsSnapshot) => {
    groupsSnapshot.forEach((groupSnapshot) => {
      const groupKey = groupSnapshot.key;
      const messagesRef = db.ref(`groups/${groupKey}/messages`);
      
      messagesRef.once('value').then((messagesSnapshot) => {
        messagesSnapshot.forEach((messageSnapshot) => {
          const message = messageSnapshot.val();
          if (message.timestamp && message.timestamp < oneMinuteAgo) {
            // Delete message if older than 1 minute
            messageSnapshot.ref.remove()
              .then(() => {
                console.log(`Deleted old message from group ${groupKey}`);
              })
              .catch((error) => {
                console.error("Error deleting message:", error);
              });
          }
        });
      });
    });
  });
  
  // Process DMs
  db.ref('dms').once('value').then((dmsSnapshot) => {
    dmsSnapshot.forEach((dmSnapshot) => {
      const dmKey = dmSnapshot.key;
      const messagesRef = db.ref(`dms/${dmKey}/messages`);
      
      messagesRef.once('value').then((messagesSnapshot) => {
        messagesSnapshot.forEach((messageSnapshot) => {
          const message = messageSnapshot.val();
          if (message.timestamp && message.timestamp < oneMinuteAgo) {
            // Delete message if older than 1 minute
            messageSnapshot.ref.remove()
              .then(() => {
                console.log(`Deleted old message from DM ${dmKey}`);
              })
              .catch((error) => {
                console.error("Error deleting message:", error);
              });
          }
        });
      });
    });
  });
}

// Run the deletion function every 30 seconds
setInterval(deleteOldMessages, 30000);

// Also run immediately when loaded
deleteOldMessages();

console.log("Auto-delete script loaded. Messages will be deleted after 1 minute.");
