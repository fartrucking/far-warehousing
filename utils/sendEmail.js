import nodemailer from 'nodemailer';
import dotenv from 'dotenv';

dotenv.config();

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: 'fartrucking4@gmail.com',
    pass: process.env.TRANSPORTER_APP_PASSWORD,
  },
});

const sendEmail = async (text) => {
  try {
    const info = await transporter.sendMail({
      from: '"FAR Warehousing" <fartrucking4@gmail.com>', // Sender email
      // to: 'vishal.kudtarkar@techsierra.in, fartrucking4@gmail.com', // Recipients
      to: "vishal.kudtarkar@techsierra.in", // Recipients
      subject: 'Order Processing Logs',
      text: text,
      html: text,
    });

    console.log('sendEmail(), Message sent on email: ', text);
    console.log('sendEmail(), ✅ Email sent:', info.messageId);
  } catch (error) {
    console.error('sendEmail(), ❌ Error sending email:', error);
  }
};

export default sendEmail;
