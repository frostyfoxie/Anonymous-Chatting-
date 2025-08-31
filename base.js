// =========================
// base.js - Auto-delete for Firebase Anonymous Chat
// =========================

// Interval in milliseconds
const CLEANUP_INTERVAL = 30000; // every 30 seconds

function autoCleanup() {
  const now = Date.now();

  // ===== Messages (10 minutes) =====
  firebase.database().ref('groups').once('value', snapshot => {
    snapshot.forEach(groupSnap => {
      const messagesRef = groupSnap.child('messages');
      messagesRef.forEach(msgSnap => {
        if (msgSnap.val().timestamp && now - msgSnap.val().timestamp > 10 * 60 * 1000) { // 10 min
          msgSnap.ref.remove();
        }
      });
    });
  });

  // ===== Files (1 minute) =====
  firebase.database().ref('groups').once('value', snapshot => {
    snapshot.forEach(groupSnap => {
      const messagesRef = groupSnap.child('messages');
      messagesRef.forEach(msgSnap => {
        if (msgSnap.val().encryptedFile && now - msgSnap.val().timestamp > 60 * 1000) { // 1 min
          msgSnap.ref.remove();
        }
      });
    });
  });

  // ===== Users & Groups (1 day) =====
  firebase.database().ref('groups').once('value', snapshot => {
    snapshot.forEach(groupSnap => {
      if (groupSnap.val().createdAt && now - groupSnap.val().createdAt > 24 * 60 * 60 * 1000) {
        groupSnap.ref.remove();
      }

      if (groupSnap.child('users')) {
        groupSnap.child('users').forEach(userSnap => {
          if (userSnap.val().joined && now - userSnap.val().joined > 24 * 60 * 60 * 1000) {
            userSnap.ref.remove();
          }
        });
      }
    });
  });
}

// Run cleanup automatically at set intervals
setInterval(autoCleanup, CLEANUP_INTERVAL);

// Optional: run immediately on load
autoCleanup();
