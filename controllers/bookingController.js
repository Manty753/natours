// eslint-disable-next-line import/no-extraneous-dependencies
const Stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const Tour = require('../models/tourModel');
const User = require('../models/userModel');
const Booking = require('../models/bookingModel');
// const APIFeatures = require('../utils/apiFeaturs');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/appError');
const factory = require('./handlerFactory');

exports.getCheckoutSession = catchAsync(async (req, res, next) => {
  //1) get currently booked tour
  const tour = await Tour.findById(req.params.tourId);

  //2) create checkout session
  const session = await Stripe.checkout.sessions.create({
    payment_method_types: ['card'],
    success_url:
      // process.env.NODE_ENV === 'development'
      //   ? `${req.protocol}://localhost:3000/?tour=${req.params.tourId}&user=${req.user.id}&price=${tour.price}`
      //   : `${req.protocol}://${req.get('host')}/?tour=${
      //       req.params.tourId
      //     }&user=${req.user.id}&price=${tour.price}`,
      process.env.NODE_ENV === 'development'
        ? `${req.protocol}://localhost:3000/my-tours`
        : `${req.protocol}://${req.get('host')}/my-tours`,
    cancel_url:
      process.env.NODE_ENV === 'development'
        ? `${req.protocol}://localhost:3000/tour/${tour.slug}`
        : `${req.protocol}://${req.get('host')}/tour/${tour.slug}`,
    customer_email: req.user.email,
    client_reference_id: req.params.tourId,
    line_items: [
      {
        price_data: {
          currency: 'usd',
          unit_amount: tour.price * 100,
          product_data: {
            name: `${tour.name} Tour`,
            description: tour.summary,
            // images need to be live links from the deployed website
            images:
              process.env.NODE_ENV === 'development'
                ? [`https://www.natours.dev/img/tours/${tour.imageCover}`]
                : [
                    `${req.protocol}://${req.get('host')}/img/tours/${
                      tour.imageCover
                    }`,
                  ],
          },
        },
        quantity: 1,
      },
    ],
    mode: 'payment',
  });
  // create session as response
  res.status(200).json({
    status: 'success',
    session,
  });
});

const createBookingCheckout = async (session) => {
  const tour = session.client_reference_id;
  const user = (await User.findOne({ email: session.customer_email }))._id;
  const price = session.amount_total / 100;

  await Booking.create({ tour, user, price });
};

exports.webhookCheckout = catchAsync(async (req, res, next) => {
  const signature = req.headers['stripe-signature'];
  let event;
  try {
    event = Stripe.webhooks.constructEvent(
      req.body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type === 'checkout.session.completed')
    await createBookingCheckout(event.data.object);

  res.status(200).json({ received: true });
});

// exports.createBookingCheckout = catchAsync(async (req, res, next) => {
//   //just temporery solution its unsecure
//   const { tour, user, price } = req.query;
//   if (!tour && !user && !price) return next();
//   await Booking.create({ tour, user, price });
//   res.redirect(req.originalUrl.split('?')[0]);
// });

exports.getAllBookings = factory.getAll(Booking);
exports.getBooking = factory.getOne(Booking);
exports.createBooking = factory.createOne(Booking);
exports.updateBooking = factory.updateOne(Booking);
exports.deleteBooking = factory.deleteOne(Booking);
