var mongoose = require('mongoose'),
    async = require('async');

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
  isDir: {
    type: Boolean,
    required: true,
    default: false
  },
  provider: {
    type: String,
    enum: providers
  },
  cloudId: {
    type: String,
  },
  size: {
    type: Number,
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

  forUserPathName: function(path, name, userId, cb) {
    this.findOne({user: userId, path: path, name: name})
    .populate('account')
    .exec(cb);
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

  makeFile: function(file, cb) {
    Account = mongoose.model('Account');
    async.series([
      async.apply(this.ensureFolder.bind(this), file.path, file.user),
      file.save.bind(file),
      async.apply(Account.addUsage.bind(Account), file.account, file.size)
    ], cb);
  },

  makeFolder: function(path, name, userId, cb) {
    var now = Date.now();

    // breaking the fuck out of the greppable codebase rule here
    var folder = new this({
      user: userId,
      path: path,
      name: name,
      isDir: true,
      createDate: now,
      changeDate: now
    });

    folder.save(cb);
  },

  ensureFolder: function(path, userId, cb) {
    if (path === '/') {
      return cb();
    }

    var self = this;
    var prefix = path.split('/').slice(0, -2).join('/') + '/';
    var folder = path.split('/').slice(-2, -1);

    this.findOne({
      user: userId,
      path: prefix,
      name: folder,
      isDir: true
    }, function(err, file) {
      if (file) {
        return cb();
      } else {
        if (prefix === '/') {
          return self.makeFolder(prefix, folder, userId, cb);
        } else {
          return self.ensureFolder(prefix, userId, function(err) {
            self.makeFolder(prefix, folder, userId, cb);
          });
        }
      }
    });
  },

  toSimpleJSON: function(file) {
    return {
      isDir: file.isDir,
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
