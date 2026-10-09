const MIN_LENGTH = 8;

export function validatePassword(password: string): string | null {
  const p = password.trim();
  if (p.length < MIN_LENGTH) {
    return `Password minimal ${MIN_LENGTH} karakter`;
  }
  if (!/[a-zA-Z]/.test(p) || !/\d/.test(p)) {
    return "Password harus mengandung huruf dan angka";
  }
  return null;
}

export function validateUsername(username: string): string | null {
  const u = username.trim();
  if (u.length < 3) return "Username minimal 3 karakter";
  if (!/^[a-zA-Z0-9._-]+$/.test(u)) {
    return "Username hanya huruf, angka, titik, garis bawah, atau strip";
  }
  return null;
}
