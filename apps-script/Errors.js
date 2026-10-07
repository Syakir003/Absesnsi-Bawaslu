/** Errors.js — error yang pesannya aman ditampilkan ke user. */
var TZ = 'Asia/Jakarta';

function userError_(message, code) {
  var err = new Error(message);
  err.userMessage = message;
  err.code = code || 'USER';
  return err;
}

function authError_(message) {
  return userError_(message, 'AUTH');
}
