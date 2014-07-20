var mongoose = require('mongoose');

var Schema = mongoose.Schema,
    ObjectId = Schema.ObjectId;

var providers = 'dropbox gdrive'.split(' ');

var FileSchema = new Schema({
  name: {
    type: String,
    required: true
  },
  path: {
    type: String,
    required: true
  },
  provider: {
    type: String,
    required: true,
    enum: providers
  },
  cloudId: {
    type: String,
    required: true
  },
  size: {
    type: Number,
    required: true
  },
  user: {
    type: ObjectId,
    ref: 'User'
  },
  account: {
    type: ObjectId,
    ref: 'Account'
  },
  createDate: {
    type: Date,
    required: true
  },
  changeDate: {
    type: Date,
    required: true
  }
});

FileSchema.statics = {
  load: function (id, cb) {
    this.findOne({_id: id})
    .populate('account')
    .populate('user')
    .exec(cb);
  },

  forUser: function(userId, cb) {
    this.find({user: userId}).exec(cb);
  },

  forUserPath: function(path, userId, cb) {
    this.find({user: userId, path: path}).exec(cb);
  },

  forAccount: function(accountId, cb) {
    this.find({account: accountId})
    .exec(cb);
  },

  inFolder: function(path, userId, cb) {
    var pathRegex = new RegExp('^' + path.replace(/\//, '\/'));
    console.log(pathRegex);
    this.find({user: userId, path: {$regex: pathRegex}}).exec(cb);
  },

  toSimpleJSON: function(file) {
    return {
      isDir: file.name === '',
      name: file.name,
      path: file.path,
      provider: file.provider,
      cloudId: file.cloudId,
      size: file.size,
      account: file.account,
      changeDate: file.changeDate.getTime()
    };
  },

  normalizePath: function(path) {
    if (path.slice(0,1) !== '/') {
      path = '/' + path;
    }

    if (path.slice(-1) !== '/') {
      path += '/';
    }

    return path
  },

  moveFolder: function(path, newPath) {
    // get all with path prefix
    // needs to do prefix:path
    File.update({path: path}, {path: newPath})
  }

};

//statics

mongoose.model('File', FileSchema);
