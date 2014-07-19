var mongoose = require('mongoose'),
    passportLocalMongoose = require('passport-local-mongoose');

var Schema = mongoose.Schema,
    ObjectId = Schema.ObjectId;

var UserSchema = new Schema({
  email: {
    type: String,
    required: true,
    unique: true
  },
  username: {
    type: String,
    required: true,
    unique: true
  },
  accounts: [{
    type: ObjectId,
    ref: 'Account'
  }],
  files: [{
    type: ObjectId,
    ref: 'File'
  }],
  createDate: {
    type: Date,
    required: true
  }
});

UserSchema.statics = {
  load: function(username, cb) {
    this.findOne({username: username}).populate('accounts').exec(cb);
  },
};

UserSchema.methods = {
  addAccount: function (accountId, cb) {
    this.accounts.push(accountId);
    this.save(cb);
  },

  removeAccount: function(accountId, cb) {
    this.accounts.pull(accountId);
    this.save(cb);
  }
};

UserSchema.plugin(passportLocalMongoose, {
  'usernameField': 'username'
});

mongoose.model('User', UserSchema);
