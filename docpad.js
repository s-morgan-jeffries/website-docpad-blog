'use strict';

var _ = require('lodash');

var addHandlebarsHelpers = function (docpadConfig) {

  // Adds the standard template helpers + any custom helpers defined in the config object
  var builtInHelpers = [
      'getEnvironment',
      'getEnvironments',
      'referencesOthers',
      'getDocument',
      'getPath',
      'getFiles',
      'getFile',
      'getFilesAtPath',
      'getFileAtPath',
      'getFileById',
      'getDatabase',
      'getCollection',
      'getBlock',
      'include'
    ],
    customHelpers = _.methods(docpadConfig.templateData),
    templateHelpers = builtInHelpers.concat(customHelpers),
    hbsHelpers;

  docpadConfig.plugins = docpadConfig.plugins || {};
  docpadConfig.plugins.handlebars = docpadConfig.plugins.handlebars || {};
  hbsHelpers = docpadConfig.plugins.handlebars.helpers = docpadConfig.plugins.handlebars.helpers || {};

  _.forEach(templateHelpers, function (helperName) {
    hbsHelpers[helperName] = function () {
      return this[helperName].apply(this, arguments);
    };
  });

  // Add helpers for DocPad blocks
  var addBlock = function (blockName, additions) {
    var block = this.getBlock(blockName);
    if (additions) {
      block.add(additions);
    }
    return block.toHTML();
  };

  hbsHelpers.addMeta = function () {
    return addBlock.call(this, 'meta');
  };

  // Recursive function to extract quoted strings from a block of content
  var quotesFromBlock = function (block) {
    // The next style of quotation (single vs double vs undefined)
    var nextQuoteStyle = function (s) {
      var singleQuote = '\'',
        dblQuote = '"',
        nextSingleIdx = s.indexOf(singleQuote),
        nextDblIdx = s.indexOf(dblQuote);
      // if both -1, undefined
      if ((nextSingleIdx === -1) && (nextDblIdx === -1)) {
        return;
      }
      // if only singleQuote was found, return that
      if (nextDblIdx === -1) {
        return singleQuote;
      }
      // if only dblQuote was found, return that
      if (nextSingleIdx === -1) {
        return dblQuote;
      }
      // otherwise return the first one
      return nextSingleIdx < nextDblIdx ? singleQuote : dblQuote;
    };

    // Predicate for whether the block contains any quotes
    var hasQuote = function (s) {
      return !!nextQuoteStyle(s);
    };

    // The next quoted string in the block
    var nextQuotedString = function (s) {
      var quoteStyle = nextQuoteStyle(s);
      return s.split(quoteStyle)[1];
    };

    // Everything remaining in the block after the next quoted string
    var remainderAfterQuote = function (s) {
      var quoteStyle = nextQuoteStyle(s);
      return s.split(quoteStyle).slice(2).join(quoteStyle);
    };

    // Base case (no quotes)
    if (!hasQuote(block)) {
      // Return an empty array
      return [];
    }
    // Otherwise, return an array containing the next quoted string plus whatever we get from calling this function
    // on the remainder
    return [nextQuotedString(block)].concat(quotesFromBlock(remainderAfterQuote(block)));
  };


  hbsHelpers.addStyles = function (options) {
    var blockContents = options.fn(this),
      blockQuotes = quotesFromBlock(blockContents),
      isCssFile = function (s) {
        var cssPattern = /\.css$/;
        return cssPattern.test(s);
      },
      cssFiles = _.filter(blockQuotes, isCssFile);
    return addBlock.call(this, 'styles', cssFiles);
  };

  hbsHelpers.addScripts = function (options) {
    var blockContents = options.fn(this),
      blockQuotes = quotesFromBlock(blockContents),
      isJsFile = function (s) {
        var jsPattern = /\.js$/;
        return jsPattern.test(s);
      },
      jsFiles = _.filter(blockQuotes, isJsFile);
    return addBlock.call(this, 'scripts', jsFiles);
  };


  // Add helpers for DocPad collections
  hbsHelpers.eachInCollection = function (collectionName, options) {
    // Make the current scope available as a private variable
    options.data = options.data || {};
    options.data.outerScope = this;
    // Get the collection
    var collection = this.getCollection(collectionName).toJSON();
    // Map over the elements of the collection and return the concatenated result
    return _.map(collection, function (el) {
      return options.fn(el);
    }).join('');
  };

  // Adds helpers from loaded modules
  var helperModules = ['handlebars-helpers'],
    helperRegistry = {
      registerHelper: function (helperName, fn) {
        hbsHelpers[helperName] = fn;
      }
    },
    opts = {},
    moduleHelpers;

  _.forEach(helperModules, function (modName) {
    moduleHelpers = require(modName);
    moduleHelpers.register(helperRegistry, opts);
  });
};

var addHandlebarsPartials = function (docpadConfig, partialsDir) {
  var fs = require('fs'),
    path = require('path'),
    hbsPartials;
  partialsDir = partialsDir || './src/partials';
  partialsDir = path.resolve(partialsDir);

  docpadConfig.plugins = docpadConfig.plugins || {};
  docpadConfig.plugins.handlebars = docpadConfig.plugins.handlebars || {};
  hbsPartials = docpadConfig.plugins.handlebars.partials = docpadConfig.plugins.handlebars.partials || {};

  var getFullPath = function (dirName) {
    return function (fileName) {
      return path.join(dirName, fileName);
    };
  };

  var readDir = function (dirName) {
    return _.map(fs.readdirSync(dirName), getFullPath(dirName));
  };

  var isDir = function (fileName) {
    return fs.statSync(fileName).isDirectory();
  };

  var isFile = function (fileName) {
    return fs.statSync(fileName).isFile();
  };

  var getPartialName = function (fileName) {
    var pattern = /\.hbs$/,
      relativeFileName = path.relative(partialsDir, fileName),
      partialName = relativeFileName.slice(0, relativeFileName.search(pattern));
    return partialName;
  };

  var readFile = function (fileName) {
    return fs.readFileSync(fileName).toString();
  };

  var processFile = function (fileName) {
    hbsPartials[getPartialName(fileName)] = readFile(fileName);
  };

  var processDir = function (dirName) {
    var dirContents = readDir(dirName),
      files = _.filter(dirContents, isFile),
      dirs = _.filter(dirContents, isDir);
    _.forEach(files, processFile);
    _.forEach(dirs, processDir);
  };

  processDir(partialsDir);

};


(function() {
  var docpadConfig;

  docpadConfig = {
    templateData: {
      site: {
        title: 'My Website'
      },
      getPreparedTitle: function() {
        if (this.document.title) {
          return "" + this.document.title + " | " + this.site.title;
        } else {
          return this.site.title;
        }
      }
    },
    collections: {
      pages: function() {
        return this.getCollection("html").findAllLive({
          isPage: true
        });
      }
    },
    plugins: {
      sass: {
        compass: true
      },
      handlebars: {
        helpers: {
        }
      }
    }
  };

  addHandlebarsHelpers(docpadConfig);
  addHandlebarsPartials(docpadConfig);

  module.exports = docpadConfig;

}).call(this);