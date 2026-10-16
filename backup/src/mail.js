import nodemailer from 'nodemailer';

export function makeTransport(smtp) {
  const opts = {
    host: smtp.host,
    port: smtp.port,
    secure: smtp.port === 465,
    connectionTimeout: 20_000,
    greetingTimeout: 20_000,
    socketTimeout: 30_000,
  };
  if (smtp.user && smtp.pass) opts.auth = { user: smtp.user, pass: smtp.pass };
  if (smtp.insecure) {
    opts.secure = false;
    opts.ignoreTLS = true;
  } else if (smtp.requireTLS && smtp.port !== 465) {
    opts.requireTLS = true;
  }
  return nodemailer.createTransport(opts);
}

export async function sendMail(config, subject, text) {
  const transport = makeTransport(config.smtp);
  return transport.sendMail({ from: config.from, to: config.alertTo, subject, text });
}
