var mongoose = require('mongoose');

var Schema = mongoose.Schema,
    ObjectId = Schema.ObjectId;

var providers = 'dropbox gdrive'.split(' ');

var AccountSchema = new Schema({
  name: {
    type: String,
    required: true
  },
  user: {
    type: ObjectId,
    ref: 'User'
  },
  oauthToken: {
    type: String,
    required: false
  },
  provider: {
    type: String,
    required: true,
    enum: providers
  },
  capacity: {
    type: Number,
    min: 0
  },
  used: {
    type: Number,
    min: 0
  },
  free: {
    type: Number,
    min: 0
  },
  priority: {
    type: Number,
    min: 1
  },
  files: [{
    type: ObjectId,
    ref: 'File'
  }],
  createDate: {
    type: Date,
    required: true
  }
});

AccountSchema.statics = {
  load: function(accountId, cb) {
    this.findOne({_id: accountId}).populate('user').exec(cb);
  },

  loadByName: function(name, userId, cb) {
    this.findOne({
      user: userId,
      name: name
    }).populate('user').exec(cb);
  },

  getMostFree: function(userId, cb) {
    // return America;
    this.findOne({user: userId}).sort({'free': -1}).exec(cb);
  },

  forUser: function(userId, cb) {
    this.find({user: userId}).exec(cb);
  },

  addUsage: function(accountId, bytes, cb) {
    this.findOne({_id: accountId}).exec(function(err, account) {
      if (err) {
        cb(err);
      }

      account.used += bytes;
      account.free -= bytes;

      account.save(cb);
    });
  },

  toSimpleJSON: function(account) {
    return {
      id: account._id,
      name: account.name,
      provider: account.provider,
      token: account.oauthToken
    };
  }
};

AccountSchema.methods = {
  addFile: function (fileId, cb) {
    this.files.push(fileId);
    this.save(cb);
  },

  removeFile: function(fileId, cb) {
    this.files.pull(fileId);
    this.save(cb);
  }
};

mongoose.model('Account', AccountSchema);
