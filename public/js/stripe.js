/* eslint-disable import/no-extraneous-dependencies */
import axios from 'axios';
import { showAlert } from './alerts';

const stripe = Stripe(
  'pk_test_51NquluL3gMgGnJBnyfcCzbnhTzh9C25fszNMy6wUgs4D8M8JUoBNoYyPACprG5nO5830MlC06b8Cy5f9w4xIzkKg00mkXixbwx'
);

export const bookTour = async (tourId) => {
  try {
    //1) get session from API
    const session = await axios(
      `http://127.0.0.1:3000/api/v1/bookings/checkout-session/${tourId}`
    );
    console.log(session);

    //2)create checoutform + charge cradit card
    await stripe.redirectToCheckout({
      sessionId: session.data.session.id,
    });
  } catch (err) {
    console.log(err);
    showAlert('error', err);
  }
};
