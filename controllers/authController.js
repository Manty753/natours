/* eslint-disable import/no-extraneous-dependencies */
const crypto = require('crypto');
const { promisify } = require('util');
const jwt = require('jsonwebtoken');
const Email = require('../utils/email');
const User = require('../models/userModel');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/appError');

const signToken = (id) =>
  jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN,
  });

const createSandToken = (user, statusCode, res) => {
  const token = signToken(user._id);
  const cookieOptions = {
    expires: new Date(
      Date.now() + process.env.JWT_COOKIE_EXPIRES_IN * 24 * 60 * 60 * 1000
    ),
    httpOnly: true,
  };
  if (process.env.NODE_ENV === 'production') cookieOptions.secure = true;
  res.cookie('jwt', token, cookieOptions);
  user.password = undefined;

  res.status(statusCode).json({
    status: 'success',
    token,
    data: {
      user: user,
    },
  });
};
exports.singup = catchAsync(async (req, res, next) => {
  const newUser = await User.create(req.body);
  const url = `${req.protocol}://${req.get('host')}/me`;
  await new Email(newUser, url).sendWelcome();
  createSandToken(newUser, 201, res);
});
exports.login = catchAsync(async (req, res, next) => {
  const { email, password } = req.body;
  //* 1) check if email and pass exist
  if (!email || !password) {
    return next(new AppError('please provide email and password', 400));
  }

  //*2) check if user && password is correct
  const user = await User.findOne({ email }).select('+password');
  if (!user || !(await user.correctPassword(password, user.password))) {
    return next(new AppError('Incorrect email or password', 401));
  }
  //*3) if ok send token to client
  createSandToken(user, 200, res);
});
exports.logout = (req, res) => {
  res.cookie('jwt', 'loggedout', {
    expires: new Date(Date.now() + 10 * 1000),
    httpOnly: true,
  });
  res.status(200).json({
    status: 'success',
  });
};

exports.protect = catchAsync(async (req, res, next) => {
  //* 1) get token and check if its there
  let token;
  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith('Bearer')
  ) {
    token = req.headers.authorization.split(' ')[1];
  } else if (req.cookies.jwt) {
    token = req.cookies.jwt;
  }
  if (!token) {
    return next(new AppError('You are not logged in, pleas log in ', 401));
  }
  //* 2) Validate token !!!
  const decoded = await promisify(jwt.verify)(token, process.env.JWT_SECRET);

  //* 3) Check if user still exists
  const currentUser = await User.findById(decoded.id);
  if (!currentUser) {
    return next(new AppError('User no longer exist', 401));
  }
  //* 4) Check if user change password after token was issued
  if (await currentUser.changedPasswordAfter(decoded.iat)) {
    return next(new AppError('User changed password', 401));
  }
  req.user = currentUser;
  res.locals.user = currentUser;
  next();
});
exports.isLoggedIn = async (req, res, next) => {
  //* 1) get token and check if its there

  if (req.cookies.jwt) {
    try {
      const decoded = await promisify(jwt.verify)(
        req.cookies.jwt,
        process.env.JWT_SECRET
      );

      //* 3) Check if user still exists
      const currentUser = await User.findById(decoded.id);
      if (!currentUser) {
        return next();
      }
      //* 4) Check if user change password after token was issued
      if (await currentUser.changedPasswordAfter(decoded.iat)) {
        return next();
      }
      res.locals.user = currentUser;

      return next();
    } catch (err) {
      return next();
    }
  }
  next();
};

exports.restrictTo =
  (...roles) =>
  (req, res, next) => {
    // roles is aray ["admin", "lead-guide"]. role = "user"
    if (!roles.includes(req.user.role)) {
      return next(new AppError('You do not have permission', 403));
    }
    next();
  };
exports.forgotPassword = catchAsync(async (req, res, next) => {
  //* 1) GET user based on email
  const user = await User.findOne({ email: req.body.email });
  if (!user) {
    return next(new AppError('There is no such user', 405));
  }
  //* 2) Generate random token
  const resetToken = await user.createPasswordResetToken();
  await user.save({ validateBeforeSave: false });
  //* 3)Send back as en email
  try {
    // await sendEmail({
    //   email: user.email,
    //   subject: 'your password reset token(valid for 10 min)',
    //   message,
    // });
    const resetURL = `${req.protocol}://${req.get(
      'host'
    )}/api/v1/users/resetPassword/${resetToken}`;
    await new Email(user, resetURL).sendPasswordReset();
    res.status(200).json({
      status: 'success',
      message: 'token send to email',
    });
  } catch (err) {
    user.passwordResetToken = undefined;
    user.passwordResetExpires = undefined;
    await user.save({ validateBeforeSave: false });
    return next(new AppError('Error sending email', 500));
  }
});
exports.resetPassword = catchAsync(async (req, res, next) => {
  // 1) Get user based on token
  const hashedToken = crypto
    .createHash('sha256')
    .update(req.params.token)
    .digest('hex');
  const user = await User.findOne({
    passwordResetToken: hashedToken,
    passwordResetExpires: { $gt: Date.now() },
  });
  // 2) Set new password if token is not expired
  if (!user) {
    return next(new AppError('token invalid', 400));
  }
  user.password = req.body.password;
  user.passwordConfirm = req.body.passwordConfirm;
  user.passwordResetToken = undefined;
  user.passwordResetExpires = undefined;
  await user.save();
  // 3) update changedPasswordAt => userModel.js
  //4) Log user send token
  createSandToken(user, 200, res);
});

exports.updatePassword = catchAsync(async (req, res, next) => {
  //1) get user from collection
  const user = await User.findById(req.user.id).select('+password');
  //2) posted password correct
  if (!(await user.correctPassword(req.body.passwordCurrent, user.password))) {
    return next(new AppError('Your current password is wrong', 401));
  }
  //3) if correct update password
  user.password = req.body.password;
  user.passwordConfirm = req.body.passwordConfirm;
  await user.save();

  //4/ log user in with new pass
  createSandToken(user, 200, res);
});
