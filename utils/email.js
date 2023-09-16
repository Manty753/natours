/* eslint-disable import/no-extraneous-dependencies */
const nodemailer = require('nodemailer');
const pug = require('pug');
const htmlToText = require('html-to-text');

module.exports = class Email {
  constructor(user, url) {
    this.to = user.email;
    this.firstName = user.name.split(' ')[0];
    this.url = url;
    this.from = `Jakub Novak <${process.env.EMAIL_FROM}>`;
  }

  newTransport() {
    if (process.env.NODE_ENV === 'production') {
      //SENDGRID
      return nodemailer.createTransport({
        host: process.env.BREVO_HOST,
        port: process.env.BREVO_PORT,
        secure: false,
        auth: {
          user: process.env.BREVO_NAME,
          pass: process.env.BREVO_KEY,
        },
      });
    }
    return nodemailer.createTransport({
      host: process.env.EMAIL_HOST,
      port: process.env.EMAIL_PORT,
      auth: {
        user: process.env.EMAIL_USERNAME,
        pass: process.env.EMAIL_PASSWORD,
      },
    });
  }

  async send(template, subject) {
    //1 render HTML based on pug
    const html = pug.renderFile(
      `${__dirname}/../views/emails/${template}.pug`,
      {
        firstName: this.firstName,
        url: this.url,
        subject,
      }
    );
    //2 define email options
    const mailOption = {
      from: this.from,
      to: this.to,
      subject,
      html,
      text: htmlToText.convert(html),
      // html:
    };

    //3 create a transport and send email
    await this.newTransport().sendMail(mailOption);
  }

  async sendWelcome() {
    await this.send('welcome', 'Welcome to Natours family!');
  }

  async sendPasswordReset() {
    await this.send(
      'passwordReset',
      'Your password reset token valid for 10 min'
    );
  }
};
