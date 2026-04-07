// src/memoryIndex/autoMemoryIndexWorker.ts
import { parentPort } from "node:worker_threads";

// src/memoryIndex/build.ts
import { createHash as createHash3 } from "crypto";
import { createReadStream } from "fs";
import {
  copyFile,
  mkdir as mkdir2,
  open,
  readdir,
  readFile,
  stat,
  writeFile as writeFile2
} from "fs/promises";

// node_modules/diff/lib/index.mjs
function Diff() {}
Diff.prototype = {
  diff: function diff(oldString, newString) {
    var _options$timeout;
    var options = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : {};
    var callback = options.callback;
    if (typeof options === "function") {
      callback = options;
      options = {};
    }
    var self2 = this;
    function done(value) {
      value = self2.postProcess(value, options);
      if (callback) {
        setTimeout(function() {
          callback(value);
        }, 0);
        return true;
      } else {
        return value;
      }
    }
    oldString = this.castInput(oldString, options);
    newString = this.castInput(newString, options);
    oldString = this.removeEmpty(this.tokenize(oldString, options));
    newString = this.removeEmpty(this.tokenize(newString, options));
    var newLen = newString.length, oldLen = oldString.length;
    var editLength = 1;
    var maxEditLength = newLen + oldLen;
    if (options.maxEditLength != null) {
      maxEditLength = Math.min(maxEditLength, options.maxEditLength);
    }
    var maxExecutionTime = (_options$timeout = options.timeout) !== null && _options$timeout !== undefined ? _options$timeout : Infinity;
    var abortAfterTimestamp = Date.now() + maxExecutionTime;
    var bestPath = [{
      oldPos: -1,
      lastComponent: undefined
    }];
    var newPos = this.extractCommon(bestPath[0], newString, oldString, 0, options);
    if (bestPath[0].oldPos + 1 >= oldLen && newPos + 1 >= newLen) {
      return done(buildValues(self2, bestPath[0].lastComponent, newString, oldString, self2.useLongestToken));
    }
    var minDiagonalToConsider = -Infinity, maxDiagonalToConsider = Infinity;
    function execEditLength() {
      for (var diagonalPath = Math.max(minDiagonalToConsider, -editLength);diagonalPath <= Math.min(maxDiagonalToConsider, editLength); diagonalPath += 2) {
        var basePath = undefined;
        var removePath = bestPath[diagonalPath - 1], addPath = bestPath[diagonalPath + 1];
        if (removePath) {
          bestPath[diagonalPath - 1] = undefined;
        }
        var canAdd = false;
        if (addPath) {
          var addPathNewPos = addPath.oldPos - diagonalPath;
          canAdd = addPath && 0 <= addPathNewPos && addPathNewPos < newLen;
        }
        var canRemove = removePath && removePath.oldPos + 1 < oldLen;
        if (!canAdd && !canRemove) {
          bestPath[diagonalPath] = undefined;
          continue;
        }
        if (!canRemove || canAdd && removePath.oldPos < addPath.oldPos) {
          basePath = self2.addToPath(addPath, true, false, 0, options);
        } else {
          basePath = self2.addToPath(removePath, false, true, 1, options);
        }
        newPos = self2.extractCommon(basePath, newString, oldString, diagonalPath, options);
        if (basePath.oldPos + 1 >= oldLen && newPos + 1 >= newLen) {
          return done(buildValues(self2, basePath.lastComponent, newString, oldString, self2.useLongestToken));
        } else {
          bestPath[diagonalPath] = basePath;
          if (basePath.oldPos + 1 >= oldLen) {
            maxDiagonalToConsider = Math.min(maxDiagonalToConsider, diagonalPath - 1);
          }
          if (newPos + 1 >= newLen) {
            minDiagonalToConsider = Math.max(minDiagonalToConsider, diagonalPath + 1);
          }
        }
      }
      editLength++;
    }
    if (callback) {
      (function exec() {
        setTimeout(function() {
          if (editLength > maxEditLength || Date.now() > abortAfterTimestamp) {
            return callback();
          }
          if (!execEditLength()) {
            exec();
          }
        }, 0);
      })();
    } else {
      while (editLength <= maxEditLength && Date.now() <= abortAfterTimestamp) {
        var ret = execEditLength();
        if (ret) {
          return ret;
        }
      }
    }
  },
  addToPath: function addToPath(path, added, removed, oldPosInc, options) {
    var last = path.lastComponent;
    if (last && !options.oneChangePerToken && last.added === added && last.removed === removed) {
      return {
        oldPos: path.oldPos + oldPosInc,
        lastComponent: {
          count: last.count + 1,
          added,
          removed,
          previousComponent: last.previousComponent
        }
      };
    } else {
      return {
        oldPos: path.oldPos + oldPosInc,
        lastComponent: {
          count: 1,
          added,
          removed,
          previousComponent: last
        }
      };
    }
  },
  extractCommon: function extractCommon(basePath, newString, oldString, diagonalPath, options) {
    var newLen = newString.length, oldLen = oldString.length, oldPos = basePath.oldPos, newPos = oldPos - diagonalPath, commonCount = 0;
    while (newPos + 1 < newLen && oldPos + 1 < oldLen && this.equals(oldString[oldPos + 1], newString[newPos + 1], options)) {
      newPos++;
      oldPos++;
      commonCount++;
      if (options.oneChangePerToken) {
        basePath.lastComponent = {
          count: 1,
          previousComponent: basePath.lastComponent,
          added: false,
          removed: false
        };
      }
    }
    if (commonCount && !options.oneChangePerToken) {
      basePath.lastComponent = {
        count: commonCount,
        previousComponent: basePath.lastComponent,
        added: false,
        removed: false
      };
    }
    basePath.oldPos = oldPos;
    return newPos;
  },
  equals: function equals(left, right, options) {
    if (options.comparator) {
      return options.comparator(left, right);
    } else {
      return left === right || options.ignoreCase && left.toLowerCase() === right.toLowerCase();
    }
  },
  removeEmpty: function removeEmpty(array) {
    var ret = [];
    for (var i = 0;i < array.length; i++) {
      if (array[i]) {
        ret.push(array[i]);
      }
    }
    return ret;
  },
  castInput: function castInput(value) {
    return value;
  },
  tokenize: function tokenize(value) {
    return Array.from(value);
  },
  join: function join(chars) {
    return chars.join("");
  },
  postProcess: function postProcess(changeObjects) {
    return changeObjects;
  }
};
function buildValues(diff2, lastComponent, newString, oldString, useLongestToken) {
  var components = [];
  var nextComponent;
  while (lastComponent) {
    components.push(lastComponent);
    nextComponent = lastComponent.previousComponent;
    delete lastComponent.previousComponent;
    lastComponent = nextComponent;
  }
  components.reverse();
  var componentPos = 0, componentLen = components.length, newPos = 0, oldPos = 0;
  for (;componentPos < componentLen; componentPos++) {
    var component = components[componentPos];
    if (!component.removed) {
      if (!component.added && useLongestToken) {
        var value = newString.slice(newPos, newPos + component.count);
        value = value.map(function(value2, i) {
          var oldValue = oldString[oldPos + i];
          return oldValue.length > value2.length ? oldValue : value2;
        });
        component.value = diff2.join(value);
      } else {
        component.value = diff2.join(newString.slice(newPos, newPos + component.count));
      }
      newPos += component.count;
      if (!component.added) {
        oldPos += component.count;
      }
    } else {
      component.value = diff2.join(oldString.slice(oldPos, oldPos + component.count));
      oldPos += component.count;
    }
  }
  return components;
}
var characterDiff = new Diff;
function longestCommonPrefix(str1, str2) {
  var i;
  for (i = 0;i < str1.length && i < str2.length; i++) {
    if (str1[i] != str2[i]) {
      return str1.slice(0, i);
    }
  }
  return str1.slice(0, i);
}
function longestCommonSuffix(str1, str2) {
  var i;
  if (!str1 || !str2 || str1[str1.length - 1] != str2[str2.length - 1]) {
    return "";
  }
  for (i = 0;i < str1.length && i < str2.length; i++) {
    if (str1[str1.length - (i + 1)] != str2[str2.length - (i + 1)]) {
      return str1.slice(-i);
    }
  }
  return str1.slice(-i);
}
function replacePrefix(string, oldPrefix, newPrefix) {
  if (string.slice(0, oldPrefix.length) != oldPrefix) {
    throw Error("string ".concat(JSON.stringify(string), " doesn't start with prefix ").concat(JSON.stringify(oldPrefix), "; this is a bug"));
  }
  return newPrefix + string.slice(oldPrefix.length);
}
function replaceSuffix(string, oldSuffix, newSuffix) {
  if (!oldSuffix) {
    return string + newSuffix;
  }
  if (string.slice(-oldSuffix.length) != oldSuffix) {
    throw Error("string ".concat(JSON.stringify(string), " doesn't end with suffix ").concat(JSON.stringify(oldSuffix), "; this is a bug"));
  }
  return string.slice(0, -oldSuffix.length) + newSuffix;
}
function removePrefix(string, oldPrefix) {
  return replacePrefix(string, oldPrefix, "");
}
function removeSuffix(string, oldSuffix) {
  return replaceSuffix(string, oldSuffix, "");
}
function maximumOverlap(string1, string2) {
  return string2.slice(0, overlapCount(string1, string2));
}
function overlapCount(a, b) {
  var startA = 0;
  if (a.length > b.length) {
    startA = a.length - b.length;
  }
  var endB = b.length;
  if (a.length < b.length) {
    endB = a.length;
  }
  var map = Array(endB);
  var k = 0;
  map[0] = 0;
  for (var j = 1;j < endB; j++) {
    if (b[j] == b[k]) {
      map[j] = map[k];
    } else {
      map[j] = k;
    }
    while (k > 0 && b[j] != b[k]) {
      k = map[k];
    }
    if (b[j] == b[k]) {
      k++;
    }
  }
  k = 0;
  for (var i = startA;i < a.length; i++) {
    while (k > 0 && a[i] != b[k]) {
      k = map[k];
    }
    if (a[i] == b[k]) {
      k++;
    }
  }
  return k;
}
var extendedWordChars = "a-zA-Z0-9_\\u{C0}-\\u{FF}\\u{D8}-\\u{F6}\\u{F8}-\\u{2C6}\\u{2C8}-\\u{2D7}\\u{2DE}-\\u{2FF}\\u{1E00}-\\u{1EFF}";
var tokenizeIncludingWhitespace = new RegExp("[".concat(extendedWordChars, "]+|\\s+|[^").concat(extendedWordChars, "]"), "ug");
var wordDiff = new Diff;
wordDiff.equals = function(left, right, options) {
  if (options.ignoreCase) {
    left = left.toLowerCase();
    right = right.toLowerCase();
  }
  return left.trim() === right.trim();
};
wordDiff.tokenize = function(value) {
  var options = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : {};
  var parts;
  if (options.intlSegmenter) {
    if (options.intlSegmenter.resolvedOptions().granularity != "word") {
      throw new Error('The segmenter passed must have a granularity of "word"');
    }
    parts = Array.from(options.intlSegmenter.segment(value), function(segment) {
      return segment.segment;
    });
  } else {
    parts = value.match(tokenizeIncludingWhitespace) || [];
  }
  var tokens = [];
  var prevPart = null;
  parts.forEach(function(part) {
    if (/\s/.test(part)) {
      if (prevPart == null) {
        tokens.push(part);
      } else {
        tokens.push(tokens.pop() + part);
      }
    } else if (/\s/.test(prevPart)) {
      if (tokens[tokens.length - 1] == prevPart) {
        tokens.push(tokens.pop() + part);
      } else {
        tokens.push(prevPart + part);
      }
    } else {
      tokens.push(part);
    }
    prevPart = part;
  });
  return tokens;
};
wordDiff.join = function(tokens) {
  return tokens.map(function(token, i) {
    if (i == 0) {
      return token;
    } else {
      return token.replace(/^\s+/, "");
    }
  }).join("");
};
wordDiff.postProcess = function(changes, options) {
  if (!changes || options.oneChangePerToken) {
    return changes;
  }
  var lastKeep = null;
  var insertion = null;
  var deletion = null;
  changes.forEach(function(change) {
    if (change.added) {
      insertion = change;
    } else if (change.removed) {
      deletion = change;
    } else {
      if (insertion || deletion) {
        dedupeWhitespaceInChangeObjects(lastKeep, deletion, insertion, change);
      }
      lastKeep = change;
      insertion = null;
      deletion = null;
    }
  });
  if (insertion || deletion) {
    dedupeWhitespaceInChangeObjects(lastKeep, deletion, insertion, null);
  }
  return changes;
};
function dedupeWhitespaceInChangeObjects(startKeep, deletion, insertion, endKeep) {
  if (deletion && insertion) {
    var oldWsPrefix = deletion.value.match(/^\s*/)[0];
    var oldWsSuffix = deletion.value.match(/\s*$/)[0];
    var newWsPrefix = insertion.value.match(/^\s*/)[0];
    var newWsSuffix = insertion.value.match(/\s*$/)[0];
    if (startKeep) {
      var commonWsPrefix = longestCommonPrefix(oldWsPrefix, newWsPrefix);
      startKeep.value = replaceSuffix(startKeep.value, newWsPrefix, commonWsPrefix);
      deletion.value = removePrefix(deletion.value, commonWsPrefix);
      insertion.value = removePrefix(insertion.value, commonWsPrefix);
    }
    if (endKeep) {
      var commonWsSuffix = longestCommonSuffix(oldWsSuffix, newWsSuffix);
      endKeep.value = replacePrefix(endKeep.value, newWsSuffix, commonWsSuffix);
      deletion.value = removeSuffix(deletion.value, commonWsSuffix);
      insertion.value = removeSuffix(insertion.value, commonWsSuffix);
    }
  } else if (insertion) {
    if (startKeep) {
      insertion.value = insertion.value.replace(/^\s*/, "");
    }
    if (endKeep) {
      endKeep.value = endKeep.value.replace(/^\s*/, "");
    }
  } else if (startKeep && endKeep) {
    var newWsFull = endKeep.value.match(/^\s*/)[0], delWsStart = deletion.value.match(/^\s*/)[0], delWsEnd = deletion.value.match(/\s*$/)[0];
    var newWsStart = longestCommonPrefix(newWsFull, delWsStart);
    deletion.value = removePrefix(deletion.value, newWsStart);
    var newWsEnd = longestCommonSuffix(removePrefix(newWsFull, newWsStart), delWsEnd);
    deletion.value = removeSuffix(deletion.value, newWsEnd);
    endKeep.value = replacePrefix(endKeep.value, newWsFull, newWsEnd);
    startKeep.value = replaceSuffix(startKeep.value, newWsFull, newWsFull.slice(0, newWsFull.length - newWsEnd.length));
  } else if (endKeep) {
    var endKeepWsPrefix = endKeep.value.match(/^\s*/)[0];
    var deletionWsSuffix = deletion.value.match(/\s*$/)[0];
    var overlap = maximumOverlap(deletionWsSuffix, endKeepWsPrefix);
    deletion.value = removeSuffix(deletion.value, overlap);
  } else if (startKeep) {
    var startKeepWsSuffix = startKeep.value.match(/\s*$/)[0];
    var deletionWsPrefix = deletion.value.match(/^\s*/)[0];
    var _overlap = maximumOverlap(startKeepWsSuffix, deletionWsPrefix);
    deletion.value = removePrefix(deletion.value, _overlap);
  }
}
var wordWithSpaceDiff = new Diff;
wordWithSpaceDiff.tokenize = function(value) {
  var regex = new RegExp("(\\r?\\n)|[".concat(extendedWordChars, "]+|[^\\S\\n\\r]+|[^").concat(extendedWordChars, "]"), "ug");
  return value.match(regex) || [];
};
var lineDiff = new Diff;
lineDiff.tokenize = function(value, options) {
  if (options.stripTrailingCr) {
    value = value.replace(/\r\n/g, `
`);
  }
  var retLines = [], linesAndNewlines = value.split(/(\n|\r\n)/);
  if (!linesAndNewlines[linesAndNewlines.length - 1]) {
    linesAndNewlines.pop();
  }
  for (var i = 0;i < linesAndNewlines.length; i++) {
    var line = linesAndNewlines[i];
    if (i % 2 && !options.newlineIsToken) {
      retLines[retLines.length - 1] += line;
    } else {
      retLines.push(line);
    }
  }
  return retLines;
};
lineDiff.equals = function(left, right, options) {
  if (options.ignoreWhitespace) {
    if (!options.newlineIsToken || !left.includes(`
`)) {
      left = left.trim();
    }
    if (!options.newlineIsToken || !right.includes(`
`)) {
      right = right.trim();
    }
  } else if (options.ignoreNewlineAtEof && !options.newlineIsToken) {
    if (left.endsWith(`
`)) {
      left = left.slice(0, -1);
    }
    if (right.endsWith(`
`)) {
      right = right.slice(0, -1);
    }
  }
  return Diff.prototype.equals.call(this, left, right, options);
};
function diffLines(oldStr, newStr, callback) {
  return lineDiff.diff(oldStr, newStr, callback);
}
var sentenceDiff = new Diff;
sentenceDiff.tokenize = function(value) {
  return value.split(/(\S.+?[.!?])(?=\s+|$)/);
};
var cssDiff = new Diff;
cssDiff.tokenize = function(value) {
  return value.split(/([{}:;,]|\s+)/);
};
function ownKeys(e, r) {
  var t = Object.keys(e);
  if (Object.getOwnPropertySymbols) {
    var o = Object.getOwnPropertySymbols(e);
    r && (o = o.filter(function(r2) {
      return Object.getOwnPropertyDescriptor(e, r2).enumerable;
    })), t.push.apply(t, o);
  }
  return t;
}
function _objectSpread2(e) {
  for (var r = 1;r < arguments.length; r++) {
    var t = arguments[r] != null ? arguments[r] : {};
    r % 2 ? ownKeys(Object(t), true).forEach(function(r2) {
      _defineProperty(e, r2, t[r2]);
    }) : Object.getOwnPropertyDescriptors ? Object.defineProperties(e, Object.getOwnPropertyDescriptors(t)) : ownKeys(Object(t)).forEach(function(r2) {
      Object.defineProperty(e, r2, Object.getOwnPropertyDescriptor(t, r2));
    });
  }
  return e;
}
function _toPrimitive(t, r) {
  if (typeof t != "object" || !t)
    return t;
  var e = t[Symbol.toPrimitive];
  if (e !== undefined) {
    var i = e.call(t, r || "default");
    if (typeof i != "object")
      return i;
    throw new TypeError("@@toPrimitive must return a primitive value.");
  }
  return (r === "string" ? String : Number)(t);
}
function _toPropertyKey(t) {
  var i = _toPrimitive(t, "string");
  return typeof i == "symbol" ? i : i + "";
}
function _typeof(o) {
  "@babel/helpers - typeof";
  return _typeof = typeof Symbol == "function" && typeof Symbol.iterator == "symbol" ? function(o2) {
    return typeof o2;
  } : function(o2) {
    return o2 && typeof Symbol == "function" && o2.constructor === Symbol && o2 !== Symbol.prototype ? "symbol" : typeof o2;
  }, _typeof(o);
}
function _defineProperty(obj, key, value) {
  key = _toPropertyKey(key);
  if (key in obj) {
    Object.defineProperty(obj, key, {
      value,
      enumerable: true,
      configurable: true,
      writable: true
    });
  } else {
    obj[key] = value;
  }
  return obj;
}
function _toConsumableArray(arr) {
  return _arrayWithoutHoles(arr) || _iterableToArray(arr) || _unsupportedIterableToArray(arr) || _nonIterableSpread();
}
function _arrayWithoutHoles(arr) {
  if (Array.isArray(arr))
    return _arrayLikeToArray(arr);
}
function _iterableToArray(iter) {
  if (typeof Symbol !== "undefined" && iter[Symbol.iterator] != null || iter["@@iterator"] != null)
    return Array.from(iter);
}
function _unsupportedIterableToArray(o, minLen) {
  if (!o)
    return;
  if (typeof o === "string")
    return _arrayLikeToArray(o, minLen);
  var n = Object.prototype.toString.call(o).slice(8, -1);
  if (n === "Object" && o.constructor)
    n = o.constructor.name;
  if (n === "Map" || n === "Set")
    return Array.from(o);
  if (n === "Arguments" || /^(?:Ui|I)nt(?:8|16|32)(?:Clamped)?Array$/.test(n))
    return _arrayLikeToArray(o, minLen);
}
function _arrayLikeToArray(arr, len) {
  if (len == null || len > arr.length)
    len = arr.length;
  for (var i = 0, arr2 = new Array(len);i < len; i++)
    arr2[i] = arr[i];
  return arr2;
}
function _nonIterableSpread() {
  throw new TypeError(`Invalid attempt to spread non-iterable instance.
In order to be iterable, non-array objects must have a [Symbol.iterator]() method.`);
}
var jsonDiff = new Diff;
jsonDiff.useLongestToken = true;
jsonDiff.tokenize = lineDiff.tokenize;
jsonDiff.castInput = function(value, options) {
  var { undefinedReplacement, stringifyReplacer: _options$stringifyRep } = options, stringifyReplacer = _options$stringifyRep === undefined ? function(k, v) {
    return typeof v === "undefined" ? undefinedReplacement : v;
  } : _options$stringifyRep;
  return typeof value === "string" ? value : JSON.stringify(canonicalize(value, null, null, stringifyReplacer), stringifyReplacer, "  ");
};
jsonDiff.equals = function(left, right, options) {
  return Diff.prototype.equals.call(jsonDiff, left.replace(/,([\r\n])/g, "$1"), right.replace(/,([\r\n])/g, "$1"), options);
};
function canonicalize(obj, stack, replacementStack, replacer, key) {
  stack = stack || [];
  replacementStack = replacementStack || [];
  if (replacer) {
    obj = replacer(key, obj);
  }
  var i;
  for (i = 0;i < stack.length; i += 1) {
    if (stack[i] === obj) {
      return replacementStack[i];
    }
  }
  var canonicalizedObj;
  if (Object.prototype.toString.call(obj) === "[object Array]") {
    stack.push(obj);
    canonicalizedObj = new Array(obj.length);
    replacementStack.push(canonicalizedObj);
    for (i = 0;i < obj.length; i += 1) {
      canonicalizedObj[i] = canonicalize(obj[i], stack, replacementStack, replacer, key);
    }
    stack.pop();
    replacementStack.pop();
    return canonicalizedObj;
  }
  if (obj && obj.toJSON) {
    obj = obj.toJSON();
  }
  if (_typeof(obj) === "object" && obj !== null) {
    stack.push(obj);
    canonicalizedObj = {};
    replacementStack.push(canonicalizedObj);
    var sortedKeys = [], _key;
    for (_key in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, _key)) {
        sortedKeys.push(_key);
      }
    }
    sortedKeys.sort();
    for (i = 0;i < sortedKeys.length; i += 1) {
      _key = sortedKeys[i];
      canonicalizedObj[_key] = canonicalize(obj[_key], stack, replacementStack, replacer, _key);
    }
    stack.pop();
    replacementStack.pop();
  } else {
    canonicalizedObj = obj;
  }
  return canonicalizedObj;
}
var arrayDiff = new Diff;
arrayDiff.tokenize = function(value) {
  return value.slice();
};
arrayDiff.join = arrayDiff.removeEmpty = function(value) {
  return value;
};
function structuredPatch(oldFileName, newFileName, oldStr, newStr, oldHeader, newHeader, options) {
  if (!options) {
    options = {};
  }
  if (typeof options === "function") {
    options = {
      callback: options
    };
  }
  if (typeof options.context === "undefined") {
    options.context = 4;
  }
  if (options.newlineIsToken) {
    throw new Error("newlineIsToken may not be used with patch-generation functions, only with diffing functions");
  }
  if (!options.callback) {
    return diffLinesResultToPatch(diffLines(oldStr, newStr, options));
  } else {
    var _options = options, _callback = _options.callback;
    diffLines(oldStr, newStr, _objectSpread2(_objectSpread2({}, options), {}, {
      callback: function callback(diff2) {
        var patch = diffLinesResultToPatch(diff2);
        _callback(patch);
      }
    }));
  }
  function diffLinesResultToPatch(diff2) {
    if (!diff2) {
      return;
    }
    diff2.push({
      value: "",
      lines: []
    });
    function contextLines(lines) {
      return lines.map(function(entry) {
        return " " + entry;
      });
    }
    var hunks = [];
    var oldRangeStart = 0, newRangeStart = 0, curRange = [], oldLine = 1, newLine = 1;
    var _loop = function _loop2() {
      var current = diff2[i], lines = current.lines || splitLines(current.value);
      current.lines = lines;
      if (current.added || current.removed) {
        var _curRange;
        if (!oldRangeStart) {
          var prev = diff2[i - 1];
          oldRangeStart = oldLine;
          newRangeStart = newLine;
          if (prev) {
            curRange = options.context > 0 ? contextLines(prev.lines.slice(-options.context)) : [];
            oldRangeStart -= curRange.length;
            newRangeStart -= curRange.length;
          }
        }
        (_curRange = curRange).push.apply(_curRange, _toConsumableArray(lines.map(function(entry) {
          return (current.added ? "+" : "-") + entry;
        })));
        if (current.added) {
          newLine += lines.length;
        } else {
          oldLine += lines.length;
        }
      } else {
        if (oldRangeStart) {
          if (lines.length <= options.context * 2 && i < diff2.length - 2) {
            var _curRange2;
            (_curRange2 = curRange).push.apply(_curRange2, _toConsumableArray(contextLines(lines)));
          } else {
            var _curRange3;
            var contextSize = Math.min(lines.length, options.context);
            (_curRange3 = curRange).push.apply(_curRange3, _toConsumableArray(contextLines(lines.slice(0, contextSize))));
            var _hunk = {
              oldStart: oldRangeStart,
              oldLines: oldLine - oldRangeStart + contextSize,
              newStart: newRangeStart,
              newLines: newLine - newRangeStart + contextSize,
              lines: curRange
            };
            hunks.push(_hunk);
            oldRangeStart = 0;
            newRangeStart = 0;
            curRange = [];
          }
        }
        oldLine += lines.length;
        newLine += lines.length;
      }
    };
    for (var i = 0;i < diff2.length; i++) {
      _loop();
    }
    for (var _i = 0, _hunks = hunks;_i < _hunks.length; _i++) {
      var hunk = _hunks[_i];
      for (var _i2 = 0;_i2 < hunk.lines.length; _i2++) {
        if (hunk.lines[_i2].endsWith(`
`)) {
          hunk.lines[_i2] = hunk.lines[_i2].slice(0, -1);
        } else {
          hunk.lines.splice(_i2 + 1, 0, "\\ No newline at end of file");
          _i2++;
        }
      }
    }
    return {
      oldFileName,
      newFileName,
      oldHeader,
      newHeader,
      hunks
    };
  }
}
function splitLines(text) {
  var hasTrailingNl = text.endsWith(`
`);
  var result = text.split(`
`).map(function(line) {
    return line + `
`;
  });
  if (hasTrailingNl) {
    result.pop();
  } else {
    result.push(result.pop().slice(0, -1));
  }
  return result;
}

// src/memoryIndex/build.ts
import { createInterface } from "readline";
import { basename, dirname, extname, join as join6, relative as relative3, resolve as resolve2 } from "path";

// node_modules/lodash-es/_freeGlobal.js
var freeGlobal = typeof global == "object" && global && global.Object === Object && global;
var _freeGlobal_default = freeGlobal;

// node_modules/lodash-es/_root.js
var freeSelf = typeof self == "object" && self && self.Object === Object && self;
var root = _freeGlobal_default || freeSelf || Function("return this")();
var _root_default = root;

// node_modules/lodash-es/_Symbol.js
var Symbol2 = _root_default.Symbol;
var _Symbol_default = Symbol2;

// node_modules/lodash-es/_getRawTag.js
var objectProto = Object.prototype;
var hasOwnProperty = objectProto.hasOwnProperty;
var nativeObjectToString = objectProto.toString;
var symToStringTag = _Symbol_default ? _Symbol_default.toStringTag : undefined;
function getRawTag(value) {
  var isOwn = hasOwnProperty.call(value, symToStringTag), tag = value[symToStringTag];
  try {
    value[symToStringTag] = undefined;
    var unmasked = true;
  } catch (e) {}
  var result = nativeObjectToString.call(value);
  if (unmasked) {
    if (isOwn) {
      value[symToStringTag] = tag;
    } else {
      delete value[symToStringTag];
    }
  }
  return result;
}
var _getRawTag_default = getRawTag;

// node_modules/lodash-es/_objectToString.js
var objectProto2 = Object.prototype;
var nativeObjectToString2 = objectProto2.toString;
function objectToString(value) {
  return nativeObjectToString2.call(value);
}
var _objectToString_default = objectToString;

// node_modules/lodash-es/_baseGetTag.js
var nullTag = "[object Null]";
var undefinedTag = "[object Undefined]";
var symToStringTag2 = _Symbol_default ? _Symbol_default.toStringTag : undefined;
function baseGetTag(value) {
  if (value == null) {
    return value === undefined ? undefinedTag : nullTag;
  }
  return symToStringTag2 && symToStringTag2 in Object(value) ? _getRawTag_default(value) : _objectToString_default(value);
}
var _baseGetTag_default = baseGetTag;

// node_modules/lodash-es/isObject.js
function isObject(value) {
  var type = typeof value;
  return value != null && (type == "object" || type == "function");
}
var isObject_default = isObject;

// node_modules/lodash-es/isFunction.js
var asyncTag = "[object AsyncFunction]";
var funcTag = "[object Function]";
var genTag = "[object GeneratorFunction]";
var proxyTag = "[object Proxy]";
function isFunction(value) {
  if (!isObject_default(value)) {
    return false;
  }
  var tag = _baseGetTag_default(value);
  return tag == funcTag || tag == genTag || tag == asyncTag || tag == proxyTag;
}
var isFunction_default = isFunction;

// node_modules/lodash-es/_coreJsData.js
var coreJsData = _root_default["__core-js_shared__"];
var _coreJsData_default = coreJsData;

// node_modules/lodash-es/_isMasked.js
var maskSrcKey = function() {
  var uid = /[^.]+$/.exec(_coreJsData_default && _coreJsData_default.keys && _coreJsData_default.keys.IE_PROTO || "");
  return uid ? "Symbol(src)_1." + uid : "";
}();
function isMasked(func) {
  return !!maskSrcKey && maskSrcKey in func;
}
var _isMasked_default = isMasked;

// node_modules/lodash-es/_toSource.js
var funcProto = Function.prototype;
var funcToString = funcProto.toString;
function toSource(func) {
  if (func != null) {
    try {
      return funcToString.call(func);
    } catch (e) {}
    try {
      return func + "";
    } catch (e) {}
  }
  return "";
}
var _toSource_default = toSource;

// node_modules/lodash-es/_baseIsNative.js
var reRegExpChar = /[\\^$.*+?()[\]{}|]/g;
var reIsHostCtor = /^\[object .+?Constructor\]$/;
var funcProto2 = Function.prototype;
var objectProto3 = Object.prototype;
var funcToString2 = funcProto2.toString;
var hasOwnProperty2 = objectProto3.hasOwnProperty;
var reIsNative = RegExp("^" + funcToString2.call(hasOwnProperty2).replace(reRegExpChar, "\\$&").replace(/hasOwnProperty|(function).*?(?=\\\()| for .+?(?=\\\])/g, "$1.*?") + "$");
function baseIsNative(value) {
  if (!isObject_default(value) || _isMasked_default(value)) {
    return false;
  }
  var pattern = isFunction_default(value) ? reIsNative : reIsHostCtor;
  return pattern.test(_toSource_default(value));
}
var _baseIsNative_default = baseIsNative;

// node_modules/lodash-es/_getValue.js
function getValue(object, key) {
  return object == null ? undefined : object[key];
}
var _getValue_default = getValue;

// node_modules/lodash-es/_getNative.js
function getNative(object, key) {
  var value = _getValue_default(object, key);
  return _baseIsNative_default(value) ? value : undefined;
}
var _getNative_default = getNative;

// node_modules/lodash-es/_nativeCreate.js
var nativeCreate = _getNative_default(Object, "create");
var _nativeCreate_default = nativeCreate;

// node_modules/lodash-es/_hashClear.js
function hashClear() {
  this.__data__ = _nativeCreate_default ? _nativeCreate_default(null) : {};
  this.size = 0;
}
var _hashClear_default = hashClear;

// node_modules/lodash-es/_hashDelete.js
function hashDelete(key) {
  var result = this.has(key) && delete this.__data__[key];
  this.size -= result ? 1 : 0;
  return result;
}
var _hashDelete_default = hashDelete;

// node_modules/lodash-es/_hashGet.js
var HASH_UNDEFINED = "__lodash_hash_undefined__";
var objectProto4 = Object.prototype;
var hasOwnProperty3 = objectProto4.hasOwnProperty;
function hashGet(key) {
  var data = this.__data__;
  if (_nativeCreate_default) {
    var result = data[key];
    return result === HASH_UNDEFINED ? undefined : result;
  }
  return hasOwnProperty3.call(data, key) ? data[key] : undefined;
}
var _hashGet_default = hashGet;

// node_modules/lodash-es/_hashHas.js
var objectProto5 = Object.prototype;
var hasOwnProperty4 = objectProto5.hasOwnProperty;
function hashHas(key) {
  var data = this.__data__;
  return _nativeCreate_default ? data[key] !== undefined : hasOwnProperty4.call(data, key);
}
var _hashHas_default = hashHas;

// node_modules/lodash-es/_hashSet.js
var HASH_UNDEFINED2 = "__lodash_hash_undefined__";
function hashSet(key, value) {
  var data = this.__data__;
  this.size += this.has(key) ? 0 : 1;
  data[key] = _nativeCreate_default && value === undefined ? HASH_UNDEFINED2 : value;
  return this;
}
var _hashSet_default = hashSet;

// node_modules/lodash-es/_Hash.js
function Hash(entries) {
  var index = -1, length = entries == null ? 0 : entries.length;
  this.clear();
  while (++index < length) {
    var entry = entries[index];
    this.set(entry[0], entry[1]);
  }
}
Hash.prototype.clear = _hashClear_default;
Hash.prototype["delete"] = _hashDelete_default;
Hash.prototype.get = _hashGet_default;
Hash.prototype.has = _hashHas_default;
Hash.prototype.set = _hashSet_default;
var _Hash_default = Hash;

// node_modules/lodash-es/_listCacheClear.js
function listCacheClear() {
  this.__data__ = [];
  this.size = 0;
}
var _listCacheClear_default = listCacheClear;

// node_modules/lodash-es/eq.js
function eq(value, other) {
  return value === other || value !== value && other !== other;
}
var eq_default = eq;

// node_modules/lodash-es/_assocIndexOf.js
function assocIndexOf(array, key) {
  var length = array.length;
  while (length--) {
    if (eq_default(array[length][0], key)) {
      return length;
    }
  }
  return -1;
}
var _assocIndexOf_default = assocIndexOf;

// node_modules/lodash-es/_listCacheDelete.js
var arrayProto = Array.prototype;
var splice = arrayProto.splice;
function listCacheDelete(key) {
  var data = this.__data__, index = _assocIndexOf_default(data, key);
  if (index < 0) {
    return false;
  }
  var lastIndex = data.length - 1;
  if (index == lastIndex) {
    data.pop();
  } else {
    splice.call(data, index, 1);
  }
  --this.size;
  return true;
}
var _listCacheDelete_default = listCacheDelete;

// node_modules/lodash-es/_listCacheGet.js
function listCacheGet(key) {
  var data = this.__data__, index = _assocIndexOf_default(data, key);
  return index < 0 ? undefined : data[index][1];
}
var _listCacheGet_default = listCacheGet;

// node_modules/lodash-es/_listCacheHas.js
function listCacheHas(key) {
  return _assocIndexOf_default(this.__data__, key) > -1;
}
var _listCacheHas_default = listCacheHas;

// node_modules/lodash-es/_listCacheSet.js
function listCacheSet(key, value) {
  var data = this.__data__, index = _assocIndexOf_default(data, key);
  if (index < 0) {
    ++this.size;
    data.push([key, value]);
  } else {
    data[index][1] = value;
  }
  return this;
}
var _listCacheSet_default = listCacheSet;

// node_modules/lodash-es/_ListCache.js
function ListCache(entries) {
  var index = -1, length = entries == null ? 0 : entries.length;
  this.clear();
  while (++index < length) {
    var entry = entries[index];
    this.set(entry[0], entry[1]);
  }
}
ListCache.prototype.clear = _listCacheClear_default;
ListCache.prototype["delete"] = _listCacheDelete_default;
ListCache.prototype.get = _listCacheGet_default;
ListCache.prototype.has = _listCacheHas_default;
ListCache.prototype.set = _listCacheSet_default;
var _ListCache_default = ListCache;

// node_modules/lodash-es/_Map.js
var Map2 = _getNative_default(_root_default, "Map");
var _Map_default = Map2;

// node_modules/lodash-es/_mapCacheClear.js
function mapCacheClear() {
  this.size = 0;
  this.__data__ = {
    hash: new _Hash_default,
    map: new (_Map_default || _ListCache_default),
    string: new _Hash_default
  };
}
var _mapCacheClear_default = mapCacheClear;

// node_modules/lodash-es/_isKeyable.js
function isKeyable(value) {
  var type = typeof value;
  return type == "string" || type == "number" || type == "symbol" || type == "boolean" ? value !== "__proto__" : value === null;
}
var _isKeyable_default = isKeyable;

// node_modules/lodash-es/_getMapData.js
function getMapData(map, key) {
  var data = map.__data__;
  return _isKeyable_default(key) ? data[typeof key == "string" ? "string" : "hash"] : data.map;
}
var _getMapData_default = getMapData;

// node_modules/lodash-es/_mapCacheDelete.js
function mapCacheDelete(key) {
  var result = _getMapData_default(this, key)["delete"](key);
  this.size -= result ? 1 : 0;
  return result;
}
var _mapCacheDelete_default = mapCacheDelete;

// node_modules/lodash-es/_mapCacheGet.js
function mapCacheGet(key) {
  return _getMapData_default(this, key).get(key);
}
var _mapCacheGet_default = mapCacheGet;

// node_modules/lodash-es/_mapCacheHas.js
function mapCacheHas(key) {
  return _getMapData_default(this, key).has(key);
}
var _mapCacheHas_default = mapCacheHas;

// node_modules/lodash-es/_mapCacheSet.js
function mapCacheSet(key, value) {
  var data = _getMapData_default(this, key), size = data.size;
  data.set(key, value);
  this.size += data.size == size ? 0 : 1;
  return this;
}
var _mapCacheSet_default = mapCacheSet;

// node_modules/lodash-es/_MapCache.js
function MapCache(entries) {
  var index = -1, length = entries == null ? 0 : entries.length;
  this.clear();
  while (++index < length) {
    var entry = entries[index];
    this.set(entry[0], entry[1]);
  }
}
MapCache.prototype.clear = _mapCacheClear_default;
MapCache.prototype["delete"] = _mapCacheDelete_default;
MapCache.prototype.get = _mapCacheGet_default;
MapCache.prototype.has = _mapCacheHas_default;
MapCache.prototype.set = _mapCacheSet_default;
var _MapCache_default = MapCache;

// node_modules/lodash-es/memoize.js
var FUNC_ERROR_TEXT = "Expected a function";
function memoize(func, resolver) {
  if (typeof func != "function" || resolver != null && typeof resolver != "function") {
    throw new TypeError(FUNC_ERROR_TEXT);
  }
  var memoized = function() {
    var args = arguments, key = resolver ? resolver.apply(this, args) : args[0], cache = memoized.cache;
    if (cache.has(key)) {
      return cache.get(key);
    }
    var result = func.apply(this, args);
    memoized.cache = cache.set(key, result) || cache;
    return result;
  };
  memoized.cache = new (memoize.Cache || _MapCache_default);
  return memoized;
}
memoize.Cache = _MapCache_default;
var memoize_default = memoize;

// src/utils/envUtils.ts
import { homedir } from "os";
import { join as join2 } from "path";
var getClaudeConfigHomeDir = memoize_default(() => {
  return (process.env.CLAUDE_CONFIG_DIR ?? join2(homedir(), ".claude")).normalize("NFC");
}, () => process.env.CLAUDE_CONFIG_DIR);

// src/utils/sessionStoragePortable.ts
import { join as join3 } from "path";

// src/utils/getWorktreePathsPortable.ts
import { execFile as execFileCb } from "child_process";
import { promisify } from "util";
var execFileAsync = promisify(execFileCb);

// src/utils/hash.ts
function djb2Hash(str) {
  let hash = 0;
  for (let i = 0;i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i) | 0;
  }
  return hash;
}

// src/utils/sessionStoragePortable.ts
var uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function validateUuid(maybeUuid) {
  if (typeof maybeUuid !== "string")
    return null;
  return uuidRegex.test(maybeUuid) ? maybeUuid : null;
}
var MAX_SANITIZED_LENGTH = 200;
function simpleHash(str) {
  return Math.abs(djb2Hash(str)).toString(36);
}
function sanitizePath(name) {
  const sanitized = name.replace(/[^a-zA-Z0-9]/g, "-");
  if (sanitized.length <= MAX_SANITIZED_LENGTH) {
    return sanitized;
  }
  const hash = typeof Bun !== "undefined" ? Bun.hash(name).toString(36) : simpleHash(name);
  return `${sanitized.slice(0, MAX_SANITIZED_LENGTH)}-${hash}`;
}
function getProjectsDir() {
  return join3(getClaudeConfigHomeDir(), "projects");
}
function getProjectDir(projectDir) {
  return join3(getProjectsDir(), sanitizePath(projectDir));
}
var TRANSCRIPT_READ_CHUNK_SIZE = 1024 * 1024;
var SKIP_PRECOMPACT_THRESHOLD = 5 * 1024 * 1024;
var ATTR_SNAP_PREFIX = Buffer.from('{"type":"attribution-snapshot"');
var SYSTEM_PREFIX = Buffer.from('{"type":"system"');
var LF = 10;
var LF_BYTE = Buffer.from([LF]);

// src/utils/projectConversationContext.ts
import { homedir as homedir2 } from "os";
import { join as join4, relative, resolve } from "path";
function getProjectConversationContextDir(rootDir) {
  return join4(resolve(rootDir), ".claude", "projects", "context");
}
function getProjectConversationTranscriptsDir(rootDir) {
  return join4(getProjectConversationContextDir(rootDir), "transcripts");
}
function getProjectConversationFileHistoryDir(rootDir) {
  return join4(getProjectConversationContextDir(rootDir), "file-history");
}
function getCodexConfigHomeDir() {
  return (process.env.CODEX_HOME ?? join4(homedir2(), ".codex")).normalize("NFC");
}
function getCodexSessionsDir() {
  return join4(getCodexConfigHomeDir(), "sessions");
}
function matchesProjectConversationRoot(rootDir, candidateCwd) {
  const normalizedRoot = resolve(rootDir);
  const normalizedCandidate = resolve(candidateCwd);
  return normalizedCandidate === normalizedRoot || normalizedCandidate.startsWith(`${normalizedRoot}/`);
}

// src/tools/ExitPlanModeTool/constants.ts
var EXIT_PLAN_MODE_V2_TOOL_NAME = "ExitPlanMode";

// src/memoryIndex/skillWriter.ts
import { mkdir, writeFile } from "fs/promises";
import { join as join5, relative as relative2 } from "path";
function resolveMemoryIndexSkillPaths(args) {
  return {
    claude: join5(args.rootDir, ".claude", "skills", "memory-index", "SKILL.md"),
    codex: join5(args.rootDir, ".codex", "skills", "memory-index", "SKILL.md"),
    opencode: join5(args.rootDir, ".opencode", "skills", "memory-index", "SKILL.md")
  };
}
function toPosixPath(value) {
  return value.replaceAll("\\", "/");
}
function formatProjectPath(rootDir, targetPath) {
  const relativePath = toPosixPath(relative2(rootDir, targetPath));
  if (!relativePath) {
    return ".";
  }
  if (relativePath === ".." || relativePath.startsWith("../") || relativePath.startsWith("/")) {
    return toPosixPath(targetPath);
  }
  return `./${relativePath}`;
}
function renderSkillMarkdown(args) {
  const outputPath = formatProjectPath(args.rootDir, args.outputDir);
  const summaryPath = `${outputPath}/index/summary.md`;
  const architecturePath = `${outputPath}/index/architecture.dot`;
  const sessionsDotPath = `${outputPath}/index/sessions.dot`;
  const dotManifestPath = `${outputPath}/index/dot/manifest.json`;
  const indexPath = `${outputPath}/__index__.py`;
  const projectMemoryGraphPath = `${outputPath}/project_memory_graph.py`;
  const skeletonIndexPath = `${outputPath}/skeleton/__index__.py`;
  const eventsPath = `${outputPath}/index/events.jsonl`;
  const memoryObjectsPath = `${outputPath}/index/memory_objects.jsonl`;
  const sessionsPath = `${outputPath}/index/sessions.jsonl`;
  const edgesPath = `${outputPath}/index/edges.jsonl`;
  const transcriptsPath = `${outputPath}/index/transcripts.jsonl`;
  return [
    "---",
    `name: ${JSON.stringify(args.name)}`,
    `description: ${JSON.stringify(args.description)}`,
    `when_to_use: ${JSON.stringify(args.whenToUse)}`,
    "---",
    "",
    "# Memory Index",
    "",
    "## Instructions",
    `- This is a blocking first step whenever \`${outputPath}/\` already exists and the task is about project history, prior user requests, previous plans, earlier code edits, or why code changed. Treat it as targeted recall, not an always-on prompt layer like \`/pin\`.`,
    `- Start with \`${summaryPath}\` for the high-level view of sessions, prompts, plans, and edits.`,
    `- Then read \`${projectMemoryGraphPath}\` for the project-level relation map: active constraints/preferences, full plan history, session-to-session links, file memory, and compact edit ranges.`,
    `- Then read \`${skeletonIndexPath}\` for the segment/topic Python skeleton map. Open only the specific modules under \`${outputPath}/skeleton/topics/\` or \`${outputPath}/skeleton/segments/\` that you actually need.`,
    `- Then read \`${indexPath}\` for recent sessions, prompts, plans, code edits, semantic memory objects, hot files, and the schema note telling you where the durable memory source lives.`,
    `- Use \`${sessionsPath}\` when you need full-history session summaries for old-memory lookup beyond the recent window.`,
    `- Use \`${dotManifestPath}\` to navigate sharded DOT files. \`${sessionsDotPath}\` is overview-only; detailed session/topic graphs live under \`${outputPath}/index/dot/\`.`,
    `- Use \`${architecturePath}\` when you want the recent high-signal event graph between transcripts, prompts, plans, edits, and touched files.`,
    "- This memory index is built from project-local raw transcript JSONL under `./.claude/projects/context/transcripts`, project-local file-history snapshots under `./.claude/projects/context/file-history`, and matching Codex session logs under `~/.codex/sessions`; it is not built from compressed context summary files.",
    `- Use \`${memoryObjectsPath}\` as the derived semantic layer for long-term user preferences, stable constraints, decision rationales, and superseded decisions. When exact wording matters, verify against \`${eventsPath}\`.`,
    `- Use \`${eventsPath}\` as the source of truth: \`user_prompt.fullText/rawContent\` for full user input, \`plan.content\` for full plan text, \`code_edit.files[].diffText/lineRanges\` for code edits, and \`code_edit.files[].beforeContent/afterContent\` for non-code text edits.`,
    `- Use \`${edgesPath}\` and \`${transcriptsPath}\` when you need exact relationships or need to jump back to the source transcript file.`,
    "- Do NOT treat `.claude/context/session_state.py`, `.claude/context/session_history.py`, `.claude/context/session_metrics.py`, or session-memory notes as source of truth. Those are lossy compact summaries.",
    "- Treat the memory index as a durable memory map. Summary files are previews; `events.jsonl` is the durable memory source. Only read the raw transcript or plan file when `events.jsonl` does not already preserve the exact detail you need.",
    "- Do not inject large memory-index artifacts wholesale into prompt context. Read only the minimal summary, skeleton shard, DOT shard, or JSONL rows needed for the current question.",
    "- If both `memory-index` and `code-index` exist, use `memory-index` for history/decision/change-tracking questions and `code-index` for repository structure and implementation navigation.",
    "- Only fall back to raw project-local transcript JSONL, matching `~/.codex/sessions` logs, or plan files when the memory index is stale, missing, or insufficient for the question at hand.",
    "- If the memory index is stale after new conversation turns or edits, rerun `/memory-index`.",
    ""
  ].join(`
`);
}
async function writeMemoryIndexSkills(args) {
  const paths = resolveMemoryIndexSkillPaths({
    rootDir: args.rootDir
  });
  await mkdir(join5(args.rootDir, ".claude", "skills", "memory-index"), {
    recursive: true
  });
  await mkdir(join5(args.rootDir, ".codex", "skills", "memory-index"), {
    recursive: true
  });
  await mkdir(join5(args.rootDir, ".opencode", "skills", "memory-index"), {
    recursive: true
  });
  const description = `Use the generated memory index under ${formatProjectPath(args.rootDir, args.outputDir)} as a durable recall map for user prompts, plans, and code diffs.`;
  const whenToUse = "Use this when the task depends on project history: previous user requests, earlier plans, prior code edits, why code changed, or what happened in earlier sessions. Prefer it before reading raw transcript files or plan files, but keep it as on-demand recall rather than an always-on layer.";
  await writeFile(paths.claude, renderSkillMarkdown({
    name: "memory-index",
    description,
    whenToUse,
    rootDir: args.rootDir,
    outputDir: args.outputDir
  }), "utf8");
  await writeFile(paths.codex, renderSkillMarkdown({
    name: "memory-index",
    description,
    whenToUse,
    rootDir: args.rootDir,
    outputDir: args.outputDir
  }), "utf8");
  await writeFile(paths.opencode, renderSkillMarkdown({
    name: "memory-index",
    description,
    whenToUse,
    rootDir: args.rootDir,
    outputDir: args.outputDir
  }), "utf8");
  return paths;
}

// src/memoryIndex/memoryObjects.ts
import { createHash } from "crypto";
var CHINESE_STOPWORDS = new Set([
  "这个",
  "那个",
  "当前",
  "现在",
  "这里",
  "理论",
  "理论上",
  "应该",
  "需要",
  "希望",
  "优先",
  "最好",
  "请",
  "必须",
  "不要",
  "不能",
  "保留",
  "改成",
  "改为",
  "改用",
  "换成",
  "换为",
  "而不是",
  "这样",
  "因为",
  "所以",
  "为了",
  "避免"
]);
var ENGLISH_STOPWORDS = new Set([
  "the",
  "a",
  "an",
  "and",
  "or",
  "to",
  "of",
  "for",
  "with",
  "that",
  "this",
  "should",
  "must",
  "need",
  "needs",
  "prefer",
  "preferred",
  "please",
  "keep",
  "use",
  "instead",
  "rather",
  "than",
  "because",
  "avoid",
  "always",
  "never",
  "dont",
  "do",
  "not",
  "only"
]);
function normalizeWhitespace(value) {
  return value.replace(/\s+/g, " ").trim();
}
function trimTrailingPunctuation(value) {
  return value.replace(/[，。！？!?,;；:：]+$/g, "").trim();
}
function stripWrapperNoise(value) {
  return value.replace(/^"+|"+$/g, "").replace(/^'+|'+$/g, "").replace(/^Requirement Changes And Overrides-?\s*/iu, "").replace(/\s+\(Active\)$/iu, "").trim();
}
function stripMarkdownNoise(value) {
  return value.replace(/^#{1,6}\s+/g, "").replace(/^[-*+]\s+/g, "").replace(/^\d+[.)]\s+/g, "").trim();
}
function splitIntoCandidateSegments(text) {
  const normalized = text.replace(/\r/g, `
`).replace(/[。！？!?]+/g, (match) => `${match}
`).replace(/[；;]+/g, (match) => `${match}
`);
  return normalized.split(/\n+/).map((part) => stripWrapperNoise(stripMarkdownNoise(normalizeWhitespace(part)))).map((part) => trimTrailingPunctuation(part)).filter((part) => part.length >= 8);
}
function stripRationaleClause(value) {
  return value.replace(/\s*(因为|原因是|为了|以便|这样|否则|避免|所以).*/u, "").replace(/\s*\b(because|so that|to avoid|to keep|since)\b.*/iu, "").trim();
}
function normalizeForKey(value) {
  return normalizeWhitespace(value.toLowerCase().replace(/[“”"'`]/g, "").replace(/[，。！？!?,;；:：()[\]{}<>]/g, " ").replace(/\b(do not|don't|must|should|prefer|please|keep|use|instead|rather than|because|always|never|only|cannot|can't)\b/gi, " ").replace(/\b(应该|必须|不要|不能|优先|希望|最好|请|保留|改成|改为|改用|换成|换为|而不是|因为|所以|为了|避免)\b/gu, " "));
}
function tokenizeComparable(value) {
  const tokens = normalizeForKey(value).match(/[a-z0-9_./-]{2,}|[\u4e00-\u9fff]{2,}/g);
  if (!tokens) {
    return [];
  }
  return tokens.filter((token) => {
    if (/^[\u4e00-\u9fff]+$/u.test(token)) {
      return !CHINESE_STOPWORDS.has(token);
    }
    return !ENGLISH_STOPWORDS.has(token);
  });
}
function countComparableTokens(value) {
  return tokenizeComparable(value).length;
}
function isSidechainSource(args) {
  return args.isSidechain === true || Boolean(args.agentId) || args.transcriptRelativePath.includes("/subagents/");
}
function looksLikeQuestion(segment) {
  return /[?？]/u.test(segment) || /(为什么|为何|怎么|如何|是否|是不是|能不能|可不可以|要不要|有没有)/u.test(segment) || /\b(why|how|what|which|can|could|should|would)\b/iu.test(segment) || /(吗|呢)$/u.test(segment);
}
function looksLikeBoilerplateNoise(segment) {
  return /^response:/iu.test(segment) || /^\[system\]/iu.test(segment) || /^unknown skill:/iu.test(segment) || /^<[^>]+>/u.test(segment) || /<\/[^>]+>$/u.test(segment) || /^(?:bash|zsh|sh):/iu.test(segment) || /^[a-z0-9._-]+@[a-z0-9._-]+:.*[$#]\s+/iu.test(segment) || /\u001b\[[0-9;]*m/u.test(segment) || /^continue the conversation from where it left off\b/iu.test(segment) || /^resume directly\b/iu.test(segment) || /^requirement changes and overrides\b/iu.test(segment) || /\bdo not acknowledge the summary\b/iu.test(segment) || /\bthis is research only\b/iu.test(segment) || /\bread source directly before making claims\b/iu.test(segment) || /\breport in under \d+ words\b/iu.test(segment);
}
function looksLikeTaskInstruction(segment) {
  return /^(?:deeply\s+)?(?:analyze|assess|evaluate|inspect|implement|check|verify|continue|resume|focus on|read|report|return|create|write|scan|find|review|benchmark|compare|save)\b/iu.test(segment) || /^(?:深度?分析|分析|评估|检查|验证|实现|继续|恢复|聚焦|阅读|报告|返回|生成|扫描|查看|找出|审查|比较|测试|保存|将结果保存|写入)/u.test(segment) || /^based on the original task\b/iu.test(segment);
}
function hasTaskVerb(segment) {
  return /\b(analyze|assess|evaluate|inspect|implement|check|verify|read|report|return|create|write|scan|find|review|benchmark|compare|save|build|run|test|edit|modify)\b/iu.test(segment) || /(分析|评估|检查|验证|实现|生成|扫描|查看|找出|比较|测试|保存|写入|读取|修改|新增|添加|删除|构建|运行|研究|调研|输出|编辑|修复)/u.test(segment);
}
function hasFormattingNoise(segment) {
  return /->/.test(segment) || /\(Active\)/iu.test(segment) || /\*\*/.test(segment) || /`{1,3}/.test(segment);
}
function hasDurablePreferenceSignal(segment) {
  return /(默认|以后|长期|一直|偏好|习惯|一律|优先保持|优先支持|优先解决|首要|重点是|重点就是|保留|我更希望|我希望|我更想|我倾向|最好)/u.test(segment) || /\b(prefer|preferred|default|going forward|for future|always keep|prioritize)\b/iu.test(segment);
}
function isLowQualitySemanticSegment(segment, maxLength) {
  return !segment || segment.length > maxLength || looksLikeQuestion(segment) || looksLikeBoilerplateNoise(segment);
}
function shouldKeepConstraintSegment(segment) {
  const statement = normalizeDirectiveStatement(segment);
  if (isLowQualitySemanticSegment(statement, 220)) {
    return false;
  }
  if (looksLikeTaskInstruction(statement)) {
    return false;
  }
  if (countComparableTokens(statement) < 2) {
    return false;
  }
  if (hasFormattingNoise(statement) && hasTaskVerb(statement)) {
    return false;
  }
  return true;
}
function shouldKeepPreferenceSegment(segment) {
  const statement = normalizeDirectiveStatement(segment);
  if (isLowQualitySemanticSegment(statement, 220)) {
    return false;
  }
  if (looksLikeTaskInstruction(statement)) {
    return false;
  }
  if (countComparableTokens(statement) < 2) {
    return false;
  }
  const durableSignal = hasDurablePreferenceSignal(statement);
  if (!durableSignal && hasTaskVerb(statement)) {
    return false;
  }
  if (!durableSignal && hasFormattingNoise(statement)) {
    return false;
  }
  return true;
}
function shouldKeepRationaleSegment(segment) {
  const statement = trimTrailingPunctuation(stripWrapperNoise(segment));
  if (isLowQualitySemanticSegment(statement, 260)) {
    return false;
  }
  if (looksLikeTaskInstruction(statement)) {
    return false;
  }
  return countComparableTokens(statement) >= 3;
}
function computeTags(text) {
  const seen = new Set;
  const tags = [];
  for (const token of tokenizeComparable(text)) {
    if (seen.has(token)) {
      continue;
    }
    seen.add(token);
    tags.push(token);
    if (tags.length >= 8) {
      break;
    }
  }
  return tags;
}
function shorten(value, maxChars = 96) {
  if (value.length <= maxChars) {
    return value;
  }
  return `${value.slice(0, maxChars - 1).trimEnd()}…`;
}
function makeObjectId(kind, statement) {
  const hash = createHash("sha1").update(`${kind}:${normalizeForKey(statement)}`).digest("hex").slice(0, 12);
  return `memory:${kind}:${hash}`;
}
function overlapEnough(left, right) {
  const leftKey = normalizeForKey(left);
  const rightKey = normalizeForKey(right);
  if (!leftKey || !rightKey) {
    return false;
  }
  if (leftKey.includes(rightKey) || rightKey.includes(leftKey)) {
    return true;
  }
  const leftTokens = new Set(tokenizeComparable(leftKey));
  const rightTokens = new Set(tokenizeComparable(rightKey));
  let overlap = 0;
  for (const token of leftTokens) {
    if (rightTokens.has(token)) {
      overlap++;
    }
  }
  return overlap >= Math.min(2, Math.max(1, Math.min(leftTokens.size, rightTokens.size)));
}
function stripTrailingRequestTail(value) {
  const clauses = value.split(/[，,]/u).map((part) => normalizeWhitespace(part)).filter(Boolean);
  if (clauses.length <= 1) {
    return value;
  }
  const [first, second] = clauses;
  if (second && /^(请|你|帮我|给我|继续|然后|再|同时|顺便|报告|返回|生成|实现|验证|检查|分析|评估|写|读|查看|测试|保存|focus on|report|read|implement|verify|check|analyze|assess|evaluate|inspect|create|find|review|compare|benchmark|save)/iu.test(second)) {
    return first;
  }
  return value;
}
function normalizeSupersededFragment(value) {
  return trimTrailingPunctuation(stripTrailingRequestTail(stripRationaleClause(stripWrapperNoise(value)))).replace(/^[，,。；;:："'`./\\\s-]+/u, "");
}
function isValidSupersededFragment(value) {
  if (!value) {
    return false;
  }
  if (looksLikeQuestion(value) || looksLikeBoilerplateNoise(value)) {
    return false;
  }
  if (hasFormattingNoise(value)) {
    return false;
  }
  if (/^(?:也)?不是/u.test(value)) {
    return false;
  }
  if (/的$/u.test(value) && countComparableTokens(value) <= 1) {
    return false;
  }
  if (value.length < 2 || value.length > 96) {
    return false;
  }
  if (value.split(/[，,；;]/u).length > 2) {
    return false;
  }
  return countComparableTokens(value) >= 1;
}
function parseSupersededDecision(segment) {
  const rules = [
    {
      regex: /(?:不要|别)\s*(.+?)(?:，|,)?\s*(?:改成|改用|换成|换为|改为|用)\s*(.+)/u,
      map: (match) => match[1] && match[2] ? { oldValue: match[1], newValue: match[2] } : null
    },
    {
      regex: /不是\s*(.+?)\s*而是\s*(.+)/u,
      map: (match) => match[1] && match[2] ? { oldValue: match[1], newValue: match[2] } : null
    },
    {
      regex: /不是\s*(.+?)(?:，|,)\s*是\s*(.+)/u,
      map: (match) => match[1] && match[2] ? { oldValue: match[1], newValue: match[2] } : null
    },
    {
      regex: /从\s*(.+?)(?:改成|改用|换成|切到|切换到|换为|改为)\s*(.+)/u,
      map: (match) => match[1] && match[2] ? { oldValue: match[1], newValue: match[2] } : null
    },
    {
      regex: /\b(?:do not|don't)\s+use\s+(.+?)(?:,|;)?\s*(?:use|switch to|replace(?: it)? with)\s+(.+)/iu,
      map: (match) => match[1] && match[2] ? { oldValue: match[1], newValue: match[2] } : null
    },
    {
      regex: /\binstead of\s+(.+?)(?:,|;)?\s*(?:use|prefer|switch to)\s+(.+)/iu,
      map: (match) => match[1] && match[2] ? { oldValue: match[1], newValue: match[2] } : null
    }
  ];
  for (const rule of rules) {
    const match = rule.regex.exec(segment);
    const parsed = match ? rule.map(match) : null;
    if (!parsed) {
      continue;
    }
    const supersededStatement = normalizeSupersededFragment(parsed.oldValue);
    const replacementStatement = normalizeSupersededFragment(parsed.newValue);
    if (!isValidSupersededFragment(supersededStatement) || !isValidSupersededFragment(replacementStatement)) {
      continue;
    }
    return {
      supersededStatement,
      replacementStatement,
      statement: `Use ${replacementStatement} instead of ${supersededStatement}`,
      confidence: 0.96
    };
  }
  return null;
}
function isConstraintSegment(segment) {
  return /(必须|不能|不要|别|只能|一定|长期有效|不要回退|不可)/u.test(segment) || /\b(must|do not|don't|never|always|only|cannot|can't)\b/iu.test(segment);
}
function isPreferenceSegment(segment) {
  return /(优先|希望|最好|保留|首要|重点是|重点就是|优先级|先做|建议|默认|以后|一直|偏好|习惯|倾向)/u.test(segment) || /\b(prefer|preferred|priority|prioritize|keep|default|usually|habit|going forward)\b/iu.test(segment);
}
function isRationaleSegment(segment) {
  return /(因为|原因|为了|以便|否则|避免|这样|所以)/u.test(segment) || /\b(because|so that|to avoid|to keep|since|why)\b/iu.test(segment);
}
function normalizeDirectiveStatement(segment) {
  const cleaned = trimTrailingPunctuation(stripRationaleClause(stripWrapperNoise(segment)));
  return cleaned.replace(/^(我觉得|我希望|希望|请|理论上|理论可以|理论应该)\s*/u, "").trim();
}
function makeExcerpt(segment) {
  return shorten(trimTrailingPunctuation(segment), 180);
}
function buildRawObject(args) {
  return {
    kind: args.kind,
    statement: args.statement,
    confidence: args.confidence,
    eventId: args.eventId,
    sessionId: args.sessionId,
    transcriptRelativePath: args.transcriptRelativePath,
    timestamp: args.timestamp,
    source: args.source,
    excerpt: args.excerpt,
    tags: computeTags([args.statement, args.supersededStatement, args.replacementStatement].filter(Boolean).join(" ")),
    supersededStatement: args.supersededStatement,
    replacementStatement: args.replacementStatement
  };
}
function buildPromptMemoryObjects(prompt) {
  const objects = [];
  const text = prompt.normalizedText || prompt.fullText;
  const sidechainSource = isSidechainSource(prompt);
  for (const segment of splitIntoCandidateSegments(text)) {
    if (looksLikeBoilerplateNoise(segment)) {
      continue;
    }
    const excerpt = makeExcerpt(segment);
    const superseded = sidechainSource ? null : parseSupersededDecision(segment);
    if (superseded) {
      objects.push(buildRawObject({
        kind: "superseded_decision",
        statement: superseded.statement,
        confidence: superseded.confidence,
        eventId: prompt.eventId,
        sessionId: prompt.sessionId,
        transcriptRelativePath: prompt.transcriptRelativePath,
        timestamp: prompt.timestamp,
        source: "prompt",
        excerpt,
        supersededStatement: superseded.supersededStatement,
        replacementStatement: superseded.replacementStatement
      }));
    }
    if (!sidechainSource && isConstraintSegment(segment) && shouldKeepConstraintSegment(segment)) {
      const statement = normalizeDirectiveStatement(segment);
      if (statement) {
        objects.push(buildRawObject({
          kind: "stable_constraint",
          statement,
          confidence: 0.9,
          eventId: prompt.eventId,
          sessionId: prompt.sessionId,
          transcriptRelativePath: prompt.transcriptRelativePath,
          timestamp: prompt.timestamp,
          source: "prompt",
          excerpt
        }));
      }
    } else if (!sidechainSource && isPreferenceSegment(segment) && shouldKeepPreferenceSegment(segment)) {
      const statement = normalizeDirectiveStatement(segment);
      if (statement) {
        objects.push(buildRawObject({
          kind: "user_preference",
          statement,
          confidence: 0.78,
          eventId: prompt.eventId,
          sessionId: prompt.sessionId,
          transcriptRelativePath: prompt.transcriptRelativePath,
          timestamp: prompt.timestamp,
          source: "prompt",
          excerpt
        }));
      }
    }
    if (!sidechainSource && isRationaleSegment(segment) && shouldKeepRationaleSegment(segment)) {
      const statement = trimTrailingPunctuation(segment);
      if (statement) {
        objects.push(buildRawObject({
          kind: "decision_rationale",
          statement,
          confidence: 0.72,
          eventId: prompt.eventId,
          sessionId: prompt.sessionId,
          transcriptRelativePath: prompt.transcriptRelativePath,
          timestamp: prompt.timestamp,
          source: "prompt",
          excerpt
        }));
      }
    }
  }
  return objects;
}
function buildPlanMemoryObjects(plan) {
  const objects = [];
  if (isSidechainSource(plan)) {
    return objects;
  }
  for (const segment of splitIntoCandidateSegments(plan.content)) {
    if (!isRationaleSegment(segment) || !shouldKeepRationaleSegment(segment)) {
      continue;
    }
    const statement = trimTrailingPunctuation(segment);
    if (!statement) {
      continue;
    }
    objects.push(buildRawObject({
      kind: "decision_rationale",
      statement,
      confidence: 0.68,
      eventId: plan.eventId,
      sessionId: plan.sessionId,
      transcriptRelativePath: plan.transcriptRelativePath,
      timestamp: plan.timestamp,
      source: "plan",
      excerpt: makeExcerpt(segment)
    }));
  }
  return objects;
}
function mergeMemoryObjects(rawObjects) {
  const merged = new Map;
  for (const object of rawObjects) {
    const objectId = makeObjectId(object.kind, object.statement);
    const existing = merged.get(objectId);
    if (!existing) {
      merged.set(objectId, {
        objectId,
        kind: object.kind,
        title: shorten(object.statement, 72),
        statement: object.statement,
        confidence: object.confidence,
        status: "active",
        firstSeenAt: object.timestamp,
        lastSeenAt: object.timestamp,
        sessionIds: [object.sessionId],
        transcriptRelativePaths: [object.transcriptRelativePath],
        sourceEventIds: [object.eventId],
        evidence: [
          {
            eventId: object.eventId,
            source: object.source,
            timestamp: object.timestamp,
            transcript: object.transcriptRelativePath,
            excerpt: object.excerpt
          }
        ],
        derivedFrom: "heuristic",
        sourceLayer: "events",
        supersededStatement: object.supersededStatement,
        replacementStatement: object.replacementStatement,
        tags: object.tags
      });
      continue;
    }
    existing.confidence = Math.max(existing.confidence, object.confidence);
    existing.firstSeenAt = existing.firstSeenAt.localeCompare(object.timestamp) <= 0 ? existing.firstSeenAt : object.timestamp;
    existing.lastSeenAt = existing.lastSeenAt.localeCompare(object.timestamp) >= 0 ? existing.lastSeenAt : object.timestamp;
    if (!existing.sessionIds.includes(object.sessionId)) {
      existing.sessionIds.push(object.sessionId);
      existing.sessionIds.sort((left, right) => left.localeCompare(right));
    }
    if (!existing.transcriptRelativePaths.includes(object.transcriptRelativePath)) {
      existing.transcriptRelativePaths.push(object.transcriptRelativePath);
      existing.transcriptRelativePaths.sort((left, right) => left.localeCompare(right));
    }
    if (!existing.sourceEventIds.includes(object.eventId)) {
      existing.sourceEventIds.push(object.eventId);
      existing.sourceEventIds.sort((left, right) => left.localeCompare(right));
    }
    if (!existing.evidence.some((evidence) => evidence.eventId === object.eventId && evidence.excerpt === object.excerpt)) {
      existing.evidence.push({
        eventId: object.eventId,
        source: object.source,
        timestamp: object.timestamp,
        transcript: object.transcriptRelativePath,
        excerpt: object.excerpt
      });
      existing.evidence.sort((left, right) => left.timestamp.localeCompare(right.timestamp));
    }
    for (const tag of object.tags) {
      if (!existing.tags.includes(tag)) {
        existing.tags.push(tag);
      }
    }
  }
  return [...merged.values()].sort((left, right) => right.lastSeenAt.localeCompare(left.lastSeenAt));
}
function applySupersededLinks(objects) {
  const sorted = [...objects].sort((left, right) => left.firstSeenAt.localeCompare(right.firstSeenAt));
  for (const object of sorted) {
    if (object.kind !== "superseded_decision") {
      continue;
    }
    const supersededStatement = object.supersededStatement;
    if (!supersededStatement) {
      continue;
    }
    for (const candidate of sorted) {
      if (candidate.objectId === object.objectId || candidate.kind === "superseded_decision" || candidate.status === "superseded" || candidate.lastSeenAt.localeCompare(object.lastSeenAt) > 0) {
        continue;
      }
      if (object.replacementStatement && overlapEnough(candidate.statement, object.replacementStatement)) {
        continue;
      }
      if (overlapEnough(candidate.statement, supersededStatement)) {
        candidate.status = "superseded";
        candidate.supersededBy = object.objectId;
      }
    }
  }
}
function countMemoryObjectsByKind(objects) {
  return {
    user_preference: objects.filter((object) => object.kind === "user_preference").length,
    stable_constraint: objects.filter((object) => object.kind === "stable_constraint").length,
    decision_rationale: objects.filter((object) => object.kind === "decision_rationale").length,
    superseded_decision: objects.filter((object) => object.kind === "superseded_decision").length
  };
}
function buildMemoryObjects(args) {
  const rawObjects = [];
  for (const prompt of args.prompts) {
    rawObjects.push(...buildPromptMemoryObjects(prompt));
  }
  for (const plan of args.plans) {
    rawObjects.push(...buildPlanMemoryObjects(plan));
  }
  const merged = mergeMemoryObjects(rawObjects);
  applySupersededLinks(merged);
  return merged.sort((left, right) => right.lastSeenAt.localeCompare(left.lastSeenAt));
}

// src/memoryIndex/memoryGraph.ts
import { createHash as createHash2 } from "crypto";
function hashContent(value) {
  return createHash2("sha1").update(value).digest("hex");
}
function truncatePreview(value, maxChars = 160) {
  const flattened = value.replace(/\s+/g, " ").trim();
  if (flattened.length <= maxChars) {
    return flattened;
  }
  return `${flattened.slice(0, maxChars - 1)}…`;
}
function stripMarkdownNoise2(value) {
  return value.replace(/^#{1,6}\s+/gm, "").replace(/`/g, "").replace(/\[(.*?)\]\((.*?)\)/g, "$1").replace(/\s+/g, " ").trim();
}
function normalizeLabel(value, fallback) {
  const cleaned = stripMarkdownNoise2(value).replace(/^[^\p{L}\p{N}]+/gu, "").replace(/[，。！？!?,;；:：]+$/gu, "").trim();
  return truncatePreview(cleaned || fallback, 96);
}
function isLowSignalPrompt(value) {
  if (!value) {
    return true;
  }
  return value.length < 4 || /^\[(request interrupted|interrupted)/iu.test(value) || /task-notification>|<task-notification>|<tool-use-id>|<output-file>/iu.test(value) || /^(是|对|好|继续|hello)[，。!！?？\s]*$/u.test(value);
}
function topicIdFromTitle(title) {
  const slug = title.normalize("NFKD").replace(/[^\x00-\x7F]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  if (slug.length >= 4) {
    return `topic:${slug.slice(0, 48)}`;
  }
  return `topic:${hashContent(title).slice(0, 12)}`;
}
function chooseSessionFocus(session) {
  const candidatePrompts = [
    session.focusPrompt,
    session.latestPromptPreview,
    ...session.promptPreviews
  ].filter((value) => Boolean(value));
  const meaningfulPrompt = candidatePrompts.find((value) => !isLowSignalPrompt(value));
  return meaningfulPrompt ?? session.latestPlanPreview ?? session.topFiles[0]?.path ?? session.sessionId;
}
function dedupeStrings(values) {
  return [...new Set(values.filter(Boolean))];
}
function dedupeByKey(items, getKey) {
  const seen = new Set;
  const result = [];
  for (const item of items) {
    const key = getKey(item);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(item);
  }
  return result;
}
function buildTopicSummary(session) {
  return truncatePreview(session.latestPlanPreview ?? chooseSessionFocus(session) ?? session.recentEdits[0]?.path ?? session.sessionId, 180);
}
function buildFileRole(args) {
  if (args.topicTitle) {
    return `Implements or supports ${args.topicTitle}`;
  }
  return `Touched in ${args.file.sessionIds.length} memory sessions`;
}
function makeEdge(source, target, kind, reason) {
  return {
    source,
    target,
    kind,
    reason: truncatePreview(reason || kind, 140)
  };
}
function buildHeuristicMemoryGraphAnalysis(input) {
  const selectedSessions = input.sessions.filter((session) => session.planCount > 0 || session.codeEditCount > 0 || session.memoryObjectIds.length > 0 || session.promptCount > 2).slice(0, 18);
  const topicAcc = new Map;
  for (const session of selectedSessions) {
    const title = normalizeLabel(session.latestPlanPreview ?? chooseSessionFocus(session), session.sessionId);
    const topicId = topicIdFromTitle(title);
    const existing = topicAcc.get(topicId);
    if (existing) {
      existing.sessionIds = dedupeStrings([...existing.sessionIds, session.sessionId]);
      existing.filePaths = dedupeStrings([
        ...existing.filePaths,
        ...session.topFiles.map((file) => file.path),
        ...session.recentEdits.map((edit) => edit.path)
      ]).slice(0, 12);
      existing.planIds = dedupeStrings([
        ...existing.planIds,
        ...session.planIds
      ]).slice(0, 8);
      existing.memoryObjectIds = dedupeStrings([
        ...existing.memoryObjectIds,
        ...session.memoryObjectIds
      ]).slice(0, 8);
      if (existing.summary.length < session.latestPlanPreview?.length) {
        existing.summary = buildTopicSummary(session);
      }
      continue;
    }
    topicAcc.set(topicId, {
      topicId,
      title,
      summary: buildTopicSummary(session),
      status: "active",
      sessionIds: [session.sessionId],
      filePaths: dedupeStrings([
        ...session.topFiles.map((file) => file.path),
        ...session.recentEdits.map((edit) => edit.path)
      ]).slice(0, 12),
      planIds: session.planIds.slice(0, 8),
      memoryObjectIds: session.memoryObjectIds.slice(0, 8),
      relatedTopicIds: new Set
    });
  }
  if (topicAcc.size === 0) {
    const fallbackFile = input.files[0];
    if (fallbackFile) {
      const title = normalizeLabel(fallbackFile.path, "Project memory");
      topicAcc.set(topicIdFromTitle(title), {
        topicId: topicIdFromTitle(title),
        title,
        summary: `Tracks edits around ${fallbackFile.path}`,
        status: "active",
        sessionIds: fallbackFile.sessionIds.slice(0, 6),
        filePaths: [fallbackFile.path],
        planIds: fallbackFile.planIds.slice(0, 4),
        memoryObjectIds: fallbackFile.memoryObjectIds.slice(0, 4),
        relatedTopicIds: new Set
      });
    }
  }
  const topics = [...topicAcc.values()];
  for (let index = 0;index < topics.length; index++) {
    const topic = topics[index];
    for (let candidateIndex = index + 1;candidateIndex < topics.length; candidateIndex++) {
      const candidate = topics[candidateIndex];
      const sharedFiles = topic.filePaths.filter((path) => candidate.filePaths.includes(path));
      const sharedMemory = topic.memoryObjectIds.filter((id) => candidate.memoryObjectIds.includes(id));
      if (sharedFiles.length === 0 && sharedMemory.length === 0) {
        continue;
      }
      topic.relatedTopicIds.add(candidate.topicId);
      candidate.relatedTopicIds.add(topic.topicId);
    }
  }
  const normalizedTopics = topics.map((topic) => ({
    topicId: topic.topicId,
    title: topic.title,
    summary: topic.summary,
    status: topic.status,
    sessionIds: topic.sessionIds,
    filePaths: topic.filePaths,
    planIds: topic.planIds,
    memoryObjectIds: topic.memoryObjectIds,
    relatedTopics: [...topic.relatedTopicIds].sort((left, right) => left.localeCompare(right)).map((topicId) => ({
      topicId,
      reason: "shared files or durable memory"
    }))
  }));
  const topicIdsBySession = new Map;
  for (const topic of normalizedTopics) {
    for (const sessionId of topic.sessionIds) {
      const existing = topicIdsBySession.get(sessionId) ?? [];
      topicIdsBySession.set(sessionId, dedupeStrings([...existing, topic.topicId]));
    }
  }
  const topicIdsByFile = new Map;
  for (const topic of normalizedTopics) {
    for (const path of topic.filePaths) {
      const existing = topicIdsByFile.get(path) ?? [];
      topicIdsByFile.set(path, dedupeStrings([...existing, topic.topicId]));
    }
  }
  const sessions = selectedSessions.map((session) => ({
    sessionId: session.sessionId,
    title: normalizeLabel(chooseSessionFocus(session), session.sessionId),
    summary: buildTopicSummary(session),
    topicIds: topicIdsBySession.get(session.sessionId) ?? [],
    filePaths: dedupeStrings([
      ...session.topFiles.map((file) => file.path),
      ...session.recentEdits.map((edit) => edit.path)
    ]).slice(0, 8),
    planIds: session.planIds.slice(0, 6),
    memoryObjectIds: session.memoryObjectIds.slice(0, 6),
    relatedSessions: dedupeByKey([
      session.previousSessionId ? {
        sessionId: session.previousSessionId,
        reason: "previous session"
      } : null,
      session.nextSessionId ? {
        sessionId: session.nextSessionId,
        reason: "next session"
      } : null
    ].filter((value) => value !== null), (value) => value.sessionId)
  }));
  const selectedFilePaths = dedupeStrings(normalizedTopics.flatMap((topic) => topic.filePaths));
  const files = input.files.filter((file) => selectedFilePaths.includes(file.path)).slice(0, 24).map((file) => ({
    path: file.path,
    role: buildFileRole({
      file,
      topicTitle: normalizedTopics.find((topic) => topic.filePaths.includes(file.path))?.title
    }),
    topicIds: topicIdsByFile.get(file.path) ?? [],
    sessionIds: file.sessionIds.slice(0, 8),
    planIds: file.planIds.slice(0, 6),
    memoryObjectIds: file.memoryObjectIds.slice(0, 6),
    recentRanges: file.recentRanges.slice(0, 5)
  }));
  const selectedSegments = input.segments.filter((segment) => selectedSessions.some((session) => session.sessionId === segment.sessionId)).slice(0, 48);
  const orderedSegments = [...selectedSegments].sort((left, right) => left.timestamp.localeCompare(right.timestamp));
  const segments = orderedSegments.map((segment, index) => {
    const topicIds = dedupeStrings(normalizedTopics.filter((topic) => topic.sessionIds.includes(segment.sessionId) || segment.filePaths.some((path) => topic.filePaths.includes(path)) || segment.planIds.some((planId) => topic.planIds.includes(planId)) || segment.memoryObjectIds.some((memoryId) => topic.memoryObjectIds.includes(memoryId))).map((topic) => topic.topicId)).slice(0, 6);
    const adjacentSegments = [
      orderedSegments[index - 1],
      orderedSegments[index + 1]
    ].filter((value) => Boolean(value) && value.sessionId === segment.sessionId);
    const sharedContextSegments = orderedSegments.filter((candidate) => {
      if (candidate.segmentId === segment.segmentId) {
        return false;
      }
      return candidate.sessionId === segment.sessionId || candidate.filePaths.some((path) => segment.filePaths.includes(path)) || candidate.planIds.some((planId) => segment.planIds.includes(planId)) || candidate.memoryObjectIds.some((memoryId) => segment.memoryObjectIds.includes(memoryId));
    });
    const relatedSegments = dedupeByKey([
      ...adjacentSegments.map((candidate) => ({
        segmentId: candidate.segmentId,
        reason: "adjacent session context"
      })),
      ...sharedContextSegments.map((candidate) => ({
        segmentId: candidate.segmentId,
        reason: candidate.filePaths.some((path) => segment.filePaths.includes(path)) ? "shared file" : candidate.planIds.some((planId) => segment.planIds.includes(planId)) ? "shared plan" : candidate.memoryObjectIds.some((memoryId) => segment.memoryObjectIds.includes(memoryId)) ? "shared durable memory" : "shared session context"
      }))
    ], (value) => value.segmentId).slice(0, 6);
    return {
      segmentId: segment.segmentId,
      kind: segment.kind,
      sessionId: segment.sessionId,
      title: normalizeLabel(segment.title, segment.segmentId),
      summary: truncatePreview(segment.summary || segment.title, 180),
      topicIds,
      filePaths: segment.filePaths.slice(0, 8),
      planIds: segment.planIds.slice(0, 6),
      memoryObjectIds: segment.memoryObjectIds.slice(0, 6),
      sourceEventIds: segment.sourceEventIds.slice(0, 8),
      recentRanges: segment.recentRanges.slice(0, 6),
      relatedSegments
    };
  });
  const edges = [];
  for (const topic of normalizedTopics) {
    for (const sessionId of topic.sessionIds) {
      edges.push(makeEdge(`session:${sessionId}`, `topic:${topic.topicId}`, "drives", `${sessionId} drives ${topic.title}`));
    }
    for (const path of topic.filePaths) {
      edges.push(makeEdge(`topic:${topic.topicId}`, `file:${path}`, "implemented_by", `${path} implements ${topic.title}`));
    }
    for (const memoryObjectId of topic.memoryObjectIds) {
      edges.push(makeEdge(`topic:${topic.topicId}`, `memory:${memoryObjectId}`, "constrained_by", memoryObjectId));
    }
    for (const planId of topic.planIds) {
      edges.push(makeEdge(`plan:${planId}`, `topic:${topic.topicId}`, "shapes", planId));
    }
    for (const relatedTopic of topic.relatedTopics) {
      edges.push(makeEdge(`topic:${topic.topicId}`, `topic:${relatedTopic.topicId}`, "related_to", relatedTopic.reason));
    }
  }
  for (const session of sessions) {
    for (const relatedSession of session.relatedSessions) {
      edges.push(makeEdge(`session:${session.sessionId}`, `session:${relatedSession.sessionId}`, "follows", relatedSession.reason));
    }
  }
  for (const segment of segments) {
    edges.push(makeEdge(`session:${segment.sessionId}`, `segment:${segment.segmentId}`, "contains", `${segment.sessionId} contains ${segment.title}`));
    for (const topicId of segment.topicIds) {
      edges.push(makeEdge(`segment:${segment.segmentId}`, `topic:${topicId}`, "supports", `${segment.title} supports ${topicId}`));
    }
    for (const filePath of segment.filePaths) {
      edges.push(makeEdge(`segment:${segment.segmentId}`, `file:${filePath}`, "touches", `${segment.title} touches ${filePath}`));
    }
    for (const planId of segment.planIds) {
      edges.push(makeEdge(`segment:${segment.segmentId}`, `plan:${planId}`, "references", `${segment.title} references ${planId}`));
    }
    for (const memoryObjectId of segment.memoryObjectIds) {
      edges.push(makeEdge(`segment:${segment.segmentId}`, `memory:${memoryObjectId}`, "recalls", `${segment.title} recalls ${memoryObjectId}`));
    }
    for (const relatedSegment of segment.relatedSegments) {
      edges.push(makeEdge(`segment:${segment.segmentId}`, `segment:${relatedSegment.segmentId}`, "related_to", relatedSegment.reason));
    }
  }
  return {
    source: "heuristic",
    generatedAt: input.generatedAt,
    topics: normalizedTopics,
    sessions,
    files,
    segments,
    edges: dedupeByKey(edges, (edge) => `${edge.source}|${edge.target}|${edge.kind}|${edge.reason}`)
  };
}
function parseEdgeRef(value) {
  if (!value) {
    return null;
  }
  const separator = value.indexOf(":");
  if (separator <= 0 || separator === value.length - 1) {
    return null;
  }
  return {
    kind: value.slice(0, separator),
    id: value.slice(separator + 1)
  };
}
function normalizeMemoryGraphAnalysis(args) {
  const fallback = buildHeuristicMemoryGraphAnalysis(args.input);
  if (!args.draft) {
    return fallback;
  }
  const knownSessionIds = new Set(args.input.sessions.map((session) => session.sessionId));
  const knownFilePaths = new Set(args.input.files.map((file) => file.path));
  const knownPlanIds = new Set(args.input.plans.map((plan) => plan.eventId));
  const knownMemoryIds = new Set(args.input.memoryObjects.map((memoryObject) => memoryObject.objectId));
  const knownSegmentIds = new Set(args.input.segments.map((segment) => segment.segmentId));
  const knownSourceEventIds = new Set(args.input.segments.flatMap((segment) => segment.sourceEventIds));
  const topicTitleToId = new Map;
  const topics = [];
  for (const draftTopic of args.draft.topics ?? []) {
    const title = normalizeLabel(draftTopic.title ?? "", "");
    if (!title) {
      continue;
    }
    const topicId = topicIdFromTitle(title);
    topicTitleToId.set(title, topicId);
    topics.push({
      topicId,
      title,
      summary: truncatePreview(stripMarkdownNoise2(draftTopic.summary ?? "") || title, 180),
      status: draftTopic.status === "superseded" ? "superseded" : "active",
      sessionIds: dedupeStrings(draftTopic.session_ids ?? []).filter((sessionId) => knownSessionIds.has(sessionId)),
      filePaths: dedupeStrings(draftTopic.file_paths ?? []).filter((path) => knownFilePaths.has(path)),
      planIds: dedupeStrings(draftTopic.plan_ids ?? []).filter((planId) => knownPlanIds.has(planId)),
      memoryObjectIds: dedupeStrings(draftTopic.memory_object_ids ?? []).filter((memoryObjectId) => knownMemoryIds.has(memoryObjectId)),
      relatedTopics: []
    });
  }
  if (topics.length === 0) {
    return fallback;
  }
  const resolvedTopicIds = new Set(topics.map((topic) => topic.topicId));
  for (const [index, draftTopic] of (args.draft.topics ?? []).entries()) {
    const topic = topics[index];
    if (!topic) {
      continue;
    }
    topic.relatedTopics = dedupeByKey((draftTopic.related_topics ?? []).map((related) => {
      const title = normalizeLabel(related.title ?? "", "");
      if (!title) {
        return null;
      }
      const topicId = topicTitleToId.get(title);
      if (!topicId || !resolvedTopicIds.has(topicId) || topicId === topic.topicId) {
        return null;
      }
      return {
        topicId,
        reason: truncatePreview(related.reason ?? "related topic", 120)
      };
    }).filter((value) => value !== null), (value) => value.topicId);
  }
  const fallbackSessionsById = new Map(fallback.sessions.map((session) => [session.sessionId, session]));
  const sessions = dedupeByKey([
    ...(args.draft.sessions ?? []).map((draftSession) => {
      const sessionId = draftSession.session_id;
      if (!sessionId || !knownSessionIds.has(sessionId)) {
        return null;
      }
      const fallbackSession = fallbackSessionsById.get(sessionId);
      return {
        sessionId,
        title: normalizeLabel(draftSession.title ?? fallbackSession?.title ?? sessionId, sessionId),
        summary: truncatePreview(stripMarkdownNoise2(draftSession.summary ?? fallbackSession?.summary ?? sessionId), 180),
        topicIds: dedupeStrings((draftSession.topic_titles ?? []).map((title) => topicTitleToId.get(normalizeLabel(title, ""))).filter((value) => Boolean(value))),
        filePaths: dedupeStrings(draftSession.file_paths ?? []).filter((path) => knownFilePaths.has(path)),
        planIds: dedupeStrings(draftSession.plan_ids ?? []).filter((planId) => knownPlanIds.has(planId)),
        memoryObjectIds: dedupeStrings(draftSession.memory_object_ids ?? []).filter((memoryObjectId) => knownMemoryIds.has(memoryObjectId)),
        relatedSessions: dedupeByKey((draftSession.related_sessions ?? []).map((relatedSession) => {
          if (!relatedSession.session_id || !knownSessionIds.has(relatedSession.session_id) || relatedSession.session_id === sessionId) {
            return null;
          }
          return {
            sessionId: relatedSession.session_id,
            reason: truncatePreview(relatedSession.reason ?? "related session", 120)
          };
        }).filter((value) => value !== null), (value) => value.sessionId)
      };
    }),
    ...fallback.sessions
  ].filter((value) => value !== null), (session) => session.sessionId);
  const fallbackFilesByPath = new Map(fallback.files.map((file) => [file.path, file]));
  const files = dedupeByKey([
    ...(args.draft.files ?? []).map((draftFile) => {
      const path = draftFile.path;
      if (!path || !knownFilePaths.has(path)) {
        return null;
      }
      const fallbackFile = fallbackFilesByPath.get(path);
      return {
        path,
        role: truncatePreview(stripMarkdownNoise2(draftFile.role ?? fallbackFile?.role ?? `Supports ${path}`), 140),
        topicIds: dedupeStrings((draftFile.topic_titles ?? []).map((title) => topicTitleToId.get(normalizeLabel(title, ""))).filter((value) => Boolean(value))),
        sessionIds: dedupeStrings(draftFile.session_ids ?? []).filter((sessionId) => knownSessionIds.has(sessionId)),
        planIds: dedupeStrings(draftFile.plan_ids ?? []).filter((planId) => knownPlanIds.has(planId)),
        memoryObjectIds: dedupeStrings(draftFile.memory_object_ids ?? []).filter((memoryObjectId) => knownMemoryIds.has(memoryObjectId)),
        recentRanges: fallbackFile?.recentRanges ?? []
      };
    }),
    ...fallback.files
  ].filter((value) => value !== null), (file) => file.path);
  const fallbackSegmentsById = new Map(fallback.segments.map((segment) => [segment.segmentId, segment]));
  const segments = dedupeByKey([
    ...(args.draft.segments ?? []).map((draftSegment) => {
      const segmentId = draftSegment.segment_id;
      if (!segmentId || !knownSegmentIds.has(segmentId)) {
        return null;
      }
      const fallbackSegment = fallbackSegmentsById.get(segmentId);
      if (!fallbackSegment) {
        return null;
      }
      const sessionId = draftSegment.session_id && knownSessionIds.has(draftSegment.session_id) ? draftSegment.session_id : fallbackSegment.sessionId;
      return {
        segmentId,
        kind: draftSegment.kind ?? fallbackSegment.kind,
        sessionId,
        title: normalizeLabel(draftSegment.title ?? fallbackSegment.title, fallbackSegment.title),
        summary: truncatePreview(stripMarkdownNoise2(draftSegment.summary ?? fallbackSegment.summary ?? fallbackSegment.title), 180),
        topicIds: dedupeStrings((draftSegment.topic_titles ?? []).map((title) => topicTitleToId.get(normalizeLabel(title, ""))).filter((value) => Boolean(value))),
        filePaths: dedupeStrings(draftSegment.file_paths ?? []).filter((path) => knownFilePaths.has(path)),
        planIds: dedupeStrings(draftSegment.plan_ids ?? []).filter((planId) => knownPlanIds.has(planId)),
        memoryObjectIds: dedupeStrings(draftSegment.memory_object_ids ?? []).filter((memoryObjectId) => knownMemoryIds.has(memoryObjectId)),
        sourceEventIds: dedupeStrings(draftSegment.source_event_ids ?? fallbackSegment.sourceEventIds).filter((sourceEventId) => knownSourceEventIds.has(sourceEventId)),
        recentRanges: fallbackSegment.recentRanges,
        relatedSegments: dedupeByKey((draftSegment.related_segments ?? []).map((relatedSegment) => {
          if (!relatedSegment.segment_id || !knownSegmentIds.has(relatedSegment.segment_id) || relatedSegment.segment_id === segmentId) {
            return null;
          }
          return {
            segmentId: relatedSegment.segment_id,
            reason: truncatePreview(relatedSegment.reason ?? "related segment", 120)
          };
        }).filter((value) => value !== null), (value) => value.segmentId)
      };
    }),
    ...fallback.segments
  ].filter((value) => value !== null), (segment) => segment.segmentId);
  const normalizeNodeRef = (ref) => {
    if (ref.kind === "topic") {
      const normalizedTitle = normalizeLabel(ref.id, "");
      if (topicTitleToId.has(normalizedTitle)) {
        return `topic:${topicTitleToId.get(normalizedTitle)}`;
      }
      return ref.id.startsWith("topic:") ? ref.id : null;
    }
    if (ref.kind === "session" && knownSessionIds.has(ref.id)) {
      return `session:${ref.id}`;
    }
    if (ref.kind === "file" && knownFilePaths.has(ref.id)) {
      return `file:${ref.id}`;
    }
    if (ref.kind === "plan" && knownPlanIds.has(ref.id)) {
      return `plan:${ref.id}`;
    }
    if (ref.kind === "memory" && knownMemoryIds.has(ref.id)) {
      return `memory:${ref.id}`;
    }
    if (ref.kind === "segment" && knownSegmentIds.has(ref.id)) {
      return `segment:${ref.id}`;
    }
    return null;
  };
  const normalizedEdges = dedupeByKey((args.draft.edges ?? []).map((edge) => {
    const source = parseEdgeRef(edge.source);
    const target = parseEdgeRef(edge.target);
    if (!source || !target || !edge.kind) {
      return null;
    }
    const sourceKey = normalizeNodeRef(source);
    const targetKey = normalizeNodeRef(target);
    if (!sourceKey || !targetKey) {
      return null;
    }
    return makeEdge(sourceKey, targetKey, edge.kind, edge.reason ?? edge.kind);
  }).filter((value) => value !== null), (edge) => `${edge.source}|${edge.target}|${edge.kind}|${edge.reason}`);
  const graph = {
    source: "agent",
    generatedAt: args.input.generatedAt,
    model: args.model,
    topics,
    sessions,
    files,
    segments,
    edges: normalizedEdges.length > 0 ? dedupeByKey([...normalizedEdges, ...fallback.edges], (edge) => `${edge.source}|${edge.target}|${edge.kind}|${edge.reason}`) : fallback.edges
  };
  return graph;
}
function dotId(value) {
  return value.replace(/[^a-zA-Z0-9_]/g, "_");
}
function dotLabel(value) {
  return value.replace(/"/g, "\\\"");
}
function renderMemoryGraphDot(analysis) {
  const lines = [
    "digraph memory_graph {",
    "  rankdir=LR;",
    '  graph [fontname="Helvetica"];',
    '  node [fontname="Helvetica", shape=box, style=rounded];',
    '  edge [fontname="Helvetica"];',
    ""
  ];
  for (const topic of analysis.topics) {
    lines.push(`  ${dotId(`topic:${topic.topicId}`)} [shape=ellipse, style="filled", fillcolor="#f3f0d7", label="${dotLabel(topic.title)}"];`);
  }
  for (const session of analysis.sessions) {
    lines.push(`  ${dotId(`session:${session.sessionId}`)} [shape=box, style="filled", fillcolor="#d9eef7", label="${dotLabel(session.title)}"];`);
  }
  for (const file of analysis.files) {
    lines.push(`  ${dotId(`file:${file.path}`)} [shape=box, style="filled", fillcolor="#ececec", label="${dotLabel(file.path)}"];`);
  }
  for (const segment of analysis.segments) {
    lines.push(`  ${dotId(`segment:${segment.segmentId}`)} [shape=note, style="filled", fillcolor="#f9e0c7", label="${dotLabel(`${segment.kind}\\n${truncatePreview(segment.title, 72)}`)}"];`);
  }
  lines.push("");
  for (const edge of analysis.edges) {
    if (edge.source.startsWith("plan:") || edge.source.startsWith("memory:") || edge.target.startsWith("plan:") || edge.target.startsWith("memory:")) {
      continue;
    }
    lines.push(`  ${dotId(edge.source)} -> ${dotId(edge.target)} [label="${dotLabel(edge.kind)}"];`);
  }
  lines.push("}");
  return lines.join(`
`);
}

// src/memoryIndex/build.ts
var ARTIFACT_VERSION = 3;
var DOT_EVENT_LIMIT = 160;
var DIFF_CONTEXT_LINES = 3;
var MEMORY_GRAPH_SEGMENT_LIMIT = 72;
var SESSION_DOT_OVERVIEW_LIMIT = 24;
var SESSION_DOT_FILE_LIMIT = 2;
var MEMORY_SOURCE_INPUTS_DESCRIPTION = "project-local raw transcript JSONL under transcripts_dir + project-local file-history snapshots + matching Codex session logs under ~/.codex/sessions for this project cwd";
var MEMORY_SOURCE_OF_TRUTH_DESCRIPTION = "index/events.jsonl -> user_prompt.fullText/rawContent | plan.content | code_edit.files[].diffText/lineRanges (code, lineRanges when available) | code_edit.files[].beforeContent/afterContent (non-code text)";
var CODE_FILE_EXTENSIONS = new Set([
  ".c",
  ".cc",
  ".cpp",
  ".cs",
  ".css",
  ".go",
  ".h",
  ".hpp",
  ".java",
  ".js",
  ".jsonc",
  ".jsx",
  ".kt",
  ".kts",
  ".less",
  ".lua",
  ".m",
  ".mm",
  ".php",
  ".pl",
  ".py",
  ".rb",
  ".rs",
  ".sass",
  ".scala",
  ".scss",
  ".sh",
  ".sql",
  ".swift",
  ".ts",
  ".tsx",
  ".vue",
  ".xml",
  ".yaml",
  ".yml",
  ".zig"
]);
var NON_CODE_TEXT_EXTENSIONS = new Set([
  "",
  ".cfg",
  ".conf",
  ".csv",
  ".env",
  ".gitignore",
  ".ini",
  ".json",
  ".lock",
  ".md",
  ".properties",
  ".rst",
  ".svg",
  ".text",
  ".toml",
  ".txt",
  ".tsv"
]);
var NON_CODE_TEXT_BASENAMES = new Set([
  ".editorconfig",
  ".gitignore",
  ".npmrc",
  ".prettierignore",
  ".prettierrc",
  "dockerfile",
  "license",
  "license.md",
  "makefile",
  "readme",
  "readme.md"
]);
function hashContent2(value) {
  return createHash3("sha1").update(value).digest("hex");
}
function toPosixPath2(value) {
  return value.replaceAll("\\", "/");
}
function makeTranscriptId(relativePath) {
  return `transcript:${relativePath}`;
}
function makePromptId(sessionId, messageId) {
  return `prompt:${sessionId}:${messageId}`;
}
function makePlanId(sessionId, messageId, contentHash, index) {
  const anchor = messageId ?? `anonymous-${index}`;
  return `plan:${sessionId}:${anchor}:${contentHash.slice(0, 12)}`;
}
function makeEditId(sessionId, fromSnapshotMessageId, toSnapshotMessageId) {
  return `edit:${sessionId}:${fromSnapshotMessageId}:${toSnapshotMessageId}`;
}
function makePatchEditId(sessionId, contentHash, index) {
  return `edit:${sessionId}:patch-${index}:${contentHash.slice(0, 12)}`;
}
function makeFileId(relativePath) {
  return `file:${relativePath}`;
}
function makeSyntheticMessageId(prefix, content, index) {
  return `${prefix}-${hashContent2(`${prefix}:${content}:${index}`).slice(0, 12)}`;
}
function isProbablyTextContent(value) {
  if (value === null || value === undefined) {
    return true;
  }
  return !value.includes("\x00");
}
function classifyFileContentKind(args) {
  const normalizedPath = toPosixPath2(args.relativePath);
  const extension = extname(normalizedPath).toLowerCase();
  const fileName = basename(normalizedPath).toLowerCase();
  if (!isProbablyTextContent(args.beforeContent) || !isProbablyTextContent(args.afterContent)) {
    return "binary_or_unknown";
  }
  if (CODE_FILE_EXTENSIONS.has(extension)) {
    return "code";
  }
  if (NON_CODE_TEXT_EXTENSIONS.has(extension) || NON_CODE_TEXT_BASENAMES.has(fileName)) {
    return "non_code_text";
  }
  return "non_code_text";
}
function renderStructuredDiffText(args) {
  const lines = [`*** ${args.status.toUpperCase()} ${args.relativePath}`];
  for (const hunk of args.hunks) {
    lines.push(`@@ -${hunk.oldStart},${hunk.oldLines} +${hunk.newStart},${hunk.newLines} @@`);
    lines.push(...hunk.lines);
  }
  return `${lines.join(`
`).trimEnd()}
`;
}
function buildStoredFileChange(args) {
  const contentKind = classifyFileContentKind({
    relativePath: args.relativePath,
    beforeContent: args.beforeContent,
    afterContent: args.afterContent
  });
  return {
    absolutePath: args.absolutePath,
    relativePath: args.relativePath,
    status: args.status,
    additions: args.additions,
    deletions: args.deletions,
    lineRanges: args.lineRanges,
    contentKind,
    diffText: args.diffText,
    beforeContent: contentKind === "non_code_text" ? args.beforeContent ?? null : undefined,
    afterContent: contentKind === "non_code_text" ? args.afterContent ?? null : undefined
  };
}
async function reportProgress(onProgress, progress) {
  await onProgress?.(progress);
}
async function ensureOutputDirectories(outputDir) {
  await mkdir2(outputDir, { recursive: true });
  await mkdir2(join6(outputDir, "index"), { recursive: true });
}
async function copyFileIfNeeded(sourcePath, targetPath) {
  let sourceStat;
  try {
    sourceStat = await stat(sourcePath);
  } catch {
    return false;
  }
  try {
    const targetStat = await stat(targetPath);
    if (targetStat.size === sourceStat.size && targetStat.mtimeMs >= sourceStat.mtimeMs) {
      return false;
    }
  } catch {}
  await mkdir2(dirname(targetPath), { recursive: true });
  await copyFile(sourcePath, targetPath);
  return true;
}
function extractSessionIdFromTranscriptRelativePath(relativePath) {
  const posixPath = toPosixPath2(relativePath);
  const parts = posixPath.split("/");
  const topLevel = parts[0];
  if (topLevel && validateUuid(topLevel)) {
    return topLevel;
  }
  const baseName = basename(posixPath, ".jsonl");
  return validateUuid(baseName) ?? null;
}
async function syncDirectoryFiles(args) {
  let copiedCount = 0;
  async function walk(currentSourceDir) {
    let entries;
    try {
      entries = await readdir(currentSourceDir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const sourcePath = join6(currentSourceDir, entry.name);
      const relativePath = relative3(args.sourceDir, sourcePath);
      const targetPath = join6(args.targetDir, relativePath);
      if (entry.isDirectory()) {
        await walk(sourcePath);
        continue;
      }
      if (!entry.isFile()) {
        continue;
      }
      if (await copyFileIfNeeded(sourcePath, targetPath)) {
        copiedCount += 1;
      }
    }
  }
  await walk(args.sourceDir);
  return copiedCount;
}
async function hydrateProjectConversationContextFromLegacyClaude(args) {
  const legacyProjectDir = getProjectDir(args.rootDir);
  const legacyTranscriptFiles = await walkJsonlFiles({
    rootDir: legacyProjectDir,
    sourceKind: "legacy_claude_project"
  });
  if (legacyTranscriptFiles.length === 0) {
    return {
      copiedTranscriptCount: 0,
      copiedBackupCount: 0,
      legacyProjectDir
    };
  }
  await mkdir2(args.transcriptsDir, { recursive: true });
  await mkdir2(args.fileHistoryDir, { recursive: true });
  let copiedTranscriptCount = 0;
  const sessionIds = new Set;
  for (let index = 0;index < legacyTranscriptFiles.length; index++) {
    const transcript = legacyTranscriptFiles[index];
    if (!transcript) {
      continue;
    }
    await reportProgress(args.onProgress, {
      phase: "discover",
      message: `Hydrating legacy Claude transcripts ${index + 1}/${legacyTranscriptFiles.length}`,
      completed: index + 1,
      total: legacyTranscriptFiles.length
    });
    const relativePath = toPosixPath2(relative3(legacyProjectDir, transcript.path));
    const targetPath = join6(args.transcriptsDir, relativePath);
    if (await copyFileIfNeeded(transcript.path, targetPath)) {
      copiedTranscriptCount += 1;
    }
    const sessionId = extractSessionIdFromTranscriptRelativePath(relativePath);
    if (sessionId) {
      sessionIds.add(sessionId);
    }
  }
  let copiedBackupCount = 0;
  const legacyFileHistoryDir = join6(getClaudeConfigHomeDir(), "file-history");
  const sessionIdList = [...sessionIds];
  for (let index = 0;index < sessionIdList.length; index++) {
    const sessionId = sessionIdList[index];
    if (!sessionId) {
      continue;
    }
    await reportProgress(args.onProgress, {
      phase: "discover",
      message: `Hydrating legacy Claude file-history ${index + 1}/${sessionIdList.length}`,
      completed: index + 1,
      total: sessionIdList.length
    });
    copiedBackupCount += await syncDirectoryFiles({
      sourceDir: join6(legacyFileHistoryDir, sessionId),
      targetDir: join6(args.fileHistoryDir, sessionId)
    });
  }
  return {
    copiedTranscriptCount,
    copiedBackupCount,
    legacyProjectDir
  };
}
async function walkJsonlFiles(args) {
  const discovered = [];
  async function walk(currentDir) {
    let entries;
    try {
      entries = await readdir(currentDir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const fullPath = join6(currentDir, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath);
        continue;
      }
      if (!entry.isFile() || !entry.name.endsWith(".jsonl")) {
        continue;
      }
      try {
        const fileStat = await stat(fullPath);
        const relativePath = toPosixPath2(relative3(args.rootDir, fullPath));
        discovered.push({
          path: fullPath,
          relativePath: args.relativePathPrefix ? `${args.relativePathPrefix}/${relativePath}` : relativePath,
          mtimeMs: fileStat.mtimeMs,
          size: fileStat.size,
          sourceKind: args.sourceKind
        });
      } catch {
        continue;
      }
    }
  }
  await walk(args.rootDir);
  return discovered;
}
async function readFirstJsonlLine(filePath) {
  let handle;
  try {
    handle = await open(filePath, "r");
    const buffer = Buffer.alloc(256 * 1024);
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
    if (bytesRead <= 0) {
      return null;
    }
    const head = buffer.toString("utf8", 0, bytesRead);
    const newlineIndex = head.indexOf(`
`);
    return (newlineIndex >= 0 ? head.slice(0, newlineIndex) : head).trim() || null;
  } catch {
    return null;
  } finally {
    await handle?.close().catch(() => {});
  }
}
function parseCodexSessionMeta(line) {
  if (!line) {
    return null;
  }
  let entry;
  try {
    entry = JSON.parse(line);
  } catch {
    return null;
  }
  if (entry.type !== "session_meta") {
    return null;
  }
  const payload = entry.payload && typeof entry.payload === "object" ? entry.payload : null;
  if (!payload || typeof payload.cwd !== "string") {
    return null;
  }
  const rawSessionId = typeof payload.id === "string" ? payload.id : basename(payload.cwd);
  const sessionId = validateUuid(rawSessionId) ?? rawSessionId;
  const source = payload.source && typeof payload.source === "object" ? payload.source : null;
  const isSidechain = Boolean(source?.subagent);
  return {
    cwd: payload.cwd,
    meta: {
      sessionId,
      isSidechain,
      agentId: typeof payload.agent_nickname === "string" ? payload.agent_nickname : undefined
    }
  };
}
async function discoverCodexSessionFiles(args) {
  const candidates = await walkJsonlFiles({
    rootDir: args.codexSessionsDir,
    sourceKind: "codex_session",
    relativePathPrefix: "codex"
  });
  const discovered = [];
  for (const candidate of candidates) {
    const sessionMeta = parseCodexSessionMeta(await readFirstJsonlLine(candidate.path));
    if (!sessionMeta || !matchesProjectConversationRoot(args.rootDir, sessionMeta.cwd)) {
      continue;
    }
    discovered.push({
      ...candidate,
      codexMeta: sessionMeta.meta
    });
  }
  return discovered;
}
async function discoverTranscriptFiles(args) {
  const discovered = await walkJsonlFiles({
    rootDir: args.transcriptsDir,
    sourceKind: "project_context"
  });
  if (args.includeCodexSessions !== false) {
    discovered.push(...await discoverCodexSessionFiles({
      rootDir: args.rootDir,
      codexSessionsDir: args.codexSessionsDir
    }));
  }
  const sorted = discovered.sort((left, right) => left.mtimeMs - right.mtimeMs);
  if (args.maxTranscripts !== undefined && args.maxTranscripts > 0 && sorted.length > args.maxTranscripts) {
    return sorted.slice(-args.maxTranscripts);
  }
  return sorted;
}
function extractTag(text, tagName) {
  const openTag = `<${tagName}>`;
  const closeTag = `</${tagName}>`;
  const start = text.indexOf(openTag);
  if (start === -1) {
    return null;
  }
  const end = text.indexOf(closeTag, start + openTag.length);
  if (end === -1) {
    return null;
  }
  return text.slice(start + openTag.length, end);
}
function simplifyUserText(text) {
  const commandName = extractTag(text, "command-name");
  if (commandName) {
    const commandArgs = extractTag(text, "command-args")?.trim();
    return `/${commandName.replace(/^\//, "")}${commandArgs ? ` ${commandArgs}` : ""}`;
  }
  const bashInput = extractTag(text, "bash-input");
  if (bashInput) {
    return `! ${bashInput}`;
  }
  return text;
}
function extractPromptText(content) {
  if (typeof content === "string") {
    const fullText = content.trim();
    const normalizedText = simplifyUserText(content).trim();
    if (!fullText && !normalizedText) {
      return null;
    }
    return {
      fullText,
      normalizedText: normalizedText || fullText,
      rawContent: content
    };
  }
  if (!Array.isArray(content)) {
    return null;
  }
  const fullParts = [];
  const normalizedParts = [];
  for (const block of content) {
    if (block && typeof block === "object" && block.type === "text" && typeof block.text === "string") {
      const rawText = block.text;
      const fullText = rawText.trim();
      const normalizedText = simplifyUserText(rawText).trim();
      if (fullText) {
        fullParts.push(fullText);
      }
      if (normalizedText) {
        normalizedParts.push(normalizedText);
      }
    }
  }
  if (fullParts.length === 0 && normalizedParts.length === 0) {
    return null;
  }
  return {
    fullText: fullParts.join(`

`),
    normalizedText: normalizedParts.join(`

`) || fullParts.join(`

`),
    rawContent: content
  };
}
function getPromptPreview(prompt) {
  return prompt.normalizedText || prompt.fullText;
}
function isTranscriptMessage(entry) {
  return typeof entry.type === "string" && typeof entry.uuid === "string" && Object.prototype.hasOwnProperty.call(entry, "parentUuid");
}
function getMessageContent(entry) {
  const message = entry.message;
  if (!message || typeof message !== "object") {
    return;
  }
  return message.content;
}
function maybeGetTimestamp(entry) {
  return typeof entry.timestamp === "string" ? entry.timestamp : undefined;
}
function applyTranscriptTimestamp(transcriptIr, timestamp) {
  if (!timestamp) {
    return;
  }
  if (!transcriptIr.firstTimestamp || timestamp < transcriptIr.firstTimestamp) {
    transcriptIr.firstTimestamp = timestamp;
  }
  if (!transcriptIr.lastTimestamp || timestamp > transcriptIr.lastTimestamp) {
    transcriptIr.lastTimestamp = timestamp;
  }
}
function parsePatchFileChanges(args) {
  const files = [];
  let current = null;
  const pushCurrent = () => {
    if (!current) {
      return;
    }
    files.push(buildStoredFileChange({
      absolutePath: current.absolutePath,
      relativePath: current.relativePath,
      status: current.status,
      additions: current.additions,
      deletions: current.deletions,
      lineRanges: current.lineRanges,
      diffText: `${current.patchLines.join(`
`).trimEnd()}
`,
      afterContent: current.status === "added" && current.addedContentLines.length > 0 && classifyFileContentKind({
        relativePath: current.relativePath,
        afterContent: current.addedContentLines.join(`
`)
      }) === "non_code_text" ? `${current.addedContentLines.join(`
`)}${current.patchLines.at(-1) === "" ? `
` : ""}` : undefined
    }));
    current = null;
  };
  const startFile = (rawPath, status) => {
    pushCurrent();
    const absolutePath = rawPath.startsWith("/") ? rawPath : resolve2(args.rootDir, rawPath);
    current = {
      absolutePath,
      relativePath: getRelativeFilePath(args.rootDir, absolutePath),
      status,
      additions: 0,
      deletions: 0,
      lineRanges: [],
      patchLines: [
        `${status === "modified" ? "*** Update File: " : status === "added" ? "*** Add File: " : "*** Delete File: "}${rawPath.trim()}`
      ],
      addedContentLines: []
    };
  };
  for (const line of args.patchText.split(/\r?\n/)) {
    if (line.startsWith("*** Update File: ")) {
      startFile(line.slice("*** Update File: ".length).trim(), "modified");
      continue;
    }
    if (line.startsWith("*** Add File: ")) {
      startFile(line.slice("*** Add File: ".length).trim(), "added");
      continue;
    }
    if (line.startsWith("*** Delete File: ")) {
      startFile(line.slice("*** Delete File: ".length).trim(), "deleted");
      continue;
    }
    if (line.startsWith("*** Move to: ") && current) {
      const movedPath = line.slice("*** Move to: ".length).trim();
      current.absolutePath = movedPath.startsWith("/") ? movedPath : resolve2(args.rootDir, movedPath);
      current.relativePath = getRelativeFilePath(args.rootDir, current.absolutePath);
      current.patchLines.push(line);
      continue;
    }
    if (!current) {
      continue;
    }
    current.patchLines.push(line);
    if (line.startsWith("+") && !line.startsWith("+++")) {
      current.additions++;
      if (current.status === "added") {
        current.addedContentLines.push(line.slice(1));
      }
    } else if (line.startsWith("-") && !line.startsWith("---")) {
      current.deletions++;
    } else if (line.startsWith("@@")) {
      const match = line.match(/^@@\s*-(\d+)(?:,(\d+))?\s+\+(\d+)(?:,(\d+))?\s*@@/);
      if (!match) {
        continue;
      }
      const oldStart = Number.parseInt(match[1], 10);
      const oldLines = Number.parseInt(match[2] ?? "1", 10);
      const newStart = Number.parseInt(match[3], 10);
      const newLines = Number.parseInt(match[4] ?? "1", 10);
      current.lineRanges.push(newLines > 0 ? formatLineRange(newStart, newLines) : formatLineRange(oldStart, oldLines));
    }
  }
  pushCurrent();
  return files;
}
async function extractProjectContextTranscriptIR(args) {
  const transcriptPath = args.transcript.path;
  const transcriptRelativePath = args.transcript.relativePath;
  const fallbackSessionId = validateUuid(basename(transcriptPath, ".jsonl")) ?? basename(transcriptPath, ".jsonl");
  const transcriptIr = {
    transcriptPath,
    transcriptRelativePath,
    sessionId: fallbackSessionId,
    isSidechain: transcriptRelativePath.includes("/subagents/"),
    prompts: [],
    plans: [],
    snapshots: [],
    codeEdits: []
  };
  let lastPrompt;
  const seenPlanKeys = new Set;
  const snapshotIndexByMessageId = new Map;
  const stream = createReadStream(transcriptPath, { encoding: "utf8" });
  const lines = createInterface({
    input: stream,
    crlfDelay: Infinity
  });
  let planIndex = 0;
  try {
    for await (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) {
        continue;
      }
      let entry;
      try {
        entry = JSON.parse(trimmed);
      } catch {
        continue;
      }
      const timestamp = maybeGetTimestamp(entry);
      applyTranscriptTimestamp(transcriptIr, timestamp);
      if (entry.type === "file-history-snapshot") {
        const snapshot = entry.snapshot;
        if (!snapshot || typeof snapshot !== "object") {
          continue;
        }
        const messageId = typeof snapshot.messageId === "string" ? snapshot.messageId : undefined;
        const snapshotTimestamp = typeof snapshot.timestamp === "string" ? snapshot.timestamp : timestamp;
        const trackedFileBackups = snapshot.trackedFileBackups && typeof snapshot.trackedFileBackups === "object" ? snapshot.trackedFileBackups : {};
        if (!messageId || !snapshotTimestamp) {
          continue;
        }
        const isSnapshotUpdate = entry.isSnapshotUpdate === true;
        const nextSnapshot = {
          messageId,
          timestamp: snapshotTimestamp,
          trackedFileBackups
        };
        const existingIndex = isSnapshotUpdate ? snapshotIndexByMessageId.get(messageId) : undefined;
        if (existingIndex === undefined) {
          snapshotIndexByMessageId.set(messageId, transcriptIr.snapshots.length);
          transcriptIr.snapshots.push(nextSnapshot);
        } else {
          transcriptIr.snapshots[existingIndex] = nextSnapshot;
        }
        continue;
      }
      if (!isTranscriptMessage(entry)) {
        continue;
      }
      if (typeof entry.sessionId === "string" && validateUuid(entry.sessionId) !== null) {
        transcriptIr.sessionId = entry.sessionId;
      }
      if (entry.isSidechain === true) {
        transcriptIr.isSidechain = true;
      }
      if (typeof entry.agentId === "string") {
        transcriptIr.agentId = entry.agentId;
      }
      if (entry.type === "user" && entry.isMeta !== true) {
        const prompt = extractPromptText(getMessageContent(entry));
        if (prompt && timestamp && typeof entry.uuid === "string") {
          const promptEvent = {
            eventId: makePromptId(transcriptIr.sessionId, entry.uuid),
            kind: "user_prompt",
            sessionId: transcriptIr.sessionId,
            transcriptPath,
            transcriptRelativePath,
            messageId: entry.uuid,
            timestamp,
            isSidechain: transcriptIr.isSidechain,
            agentId: transcriptIr.agentId,
            fullText: prompt.fullText,
            normalizedText: prompt.normalizedText,
            text: prompt.fullText,
            rawContent: prompt.rawContent
          };
          transcriptIr.prompts.push(promptEvent);
          lastPrompt = promptEvent;
        }
        if (typeof entry.planContent === "string" && entry.planContent.trim()) {
          const content = entry.planContent.trim();
          const contentHash = hashContent2(content);
          const planKey = [
            transcriptIr.sessionId,
            entry.uuid,
            "user_plan",
            contentHash
          ].join(":");
          if (!seenPlanKeys.has(planKey) && timestamp) {
            seenPlanKeys.add(planKey);
            transcriptIr.plans.push({
              eventId: makePlanId(transcriptIr.sessionId, entry.uuid, contentHash, planIndex++),
              kind: "plan",
              sessionId: transcriptIr.sessionId,
              transcriptPath,
              transcriptRelativePath,
              messageId: entry.uuid,
              timestamp,
              isSidechain: transcriptIr.isSidechain,
              agentId: transcriptIr.agentId,
              source: "user_plan",
              content,
              contentHash,
              promptEventId: lastPrompt?.eventId,
              promptMessageId: lastPrompt?.messageId
            });
          }
        }
        continue;
      }
      if (entry.type === "assistant") {
        const content = getMessageContent(entry);
        if (!Array.isArray(content) || !timestamp) {
          continue;
        }
        for (const block of content) {
          if (!block || typeof block !== "object" || block.type !== "tool_use" || block.name !== EXIT_PLAN_MODE_V2_TOOL_NAME) {
            continue;
          }
          const input = block.input;
          if (!input || typeof input.plan !== "string" || !input.plan.trim()) {
            continue;
          }
          const contentText = input.plan.trim();
          const contentHash = hashContent2(contentText);
          const planKey = [
            transcriptIr.sessionId,
            entry.uuid,
            "exit_plan_tool",
            contentHash
          ].join(":");
          if (seenPlanKeys.has(planKey)) {
            continue;
          }
          seenPlanKeys.add(planKey);
          transcriptIr.plans.push({
            eventId: makePlanId(transcriptIr.sessionId, typeof entry.uuid === "string" ? entry.uuid : undefined, contentHash, planIndex++),
            kind: "plan",
            sessionId: transcriptIr.sessionId,
            transcriptPath,
            transcriptRelativePath,
            messageId: typeof entry.uuid === "string" ? entry.uuid : undefined,
            timestamp,
            isSidechain: transcriptIr.isSidechain,
            agentId: transcriptIr.agentId,
            source: "exit_plan_tool",
            content: contentText,
            contentHash,
            planFilePath: typeof input.planFilePath === "string" ? input.planFilePath : undefined,
            promptEventId: lastPrompt?.eventId,
            promptMessageId: lastPrompt?.messageId
          });
        }
        continue;
      }
      if (entry.type === "attachment" && entry.attachment && typeof entry.attachment === "object") {
        const attachment = entry.attachment;
        if (attachment.type === "plan_file_reference" && typeof attachment.planContent === "string" && attachment.planContent.trim() && timestamp) {
          const content = attachment.planContent.trim();
          const contentHash = hashContent2(content);
          const planKey = [
            transcriptIr.sessionId,
            typeof entry.uuid === "string" ? entry.uuid : "attachment",
            "plan_attachment",
            contentHash
          ].join(":");
          if (seenPlanKeys.has(planKey)) {
            continue;
          }
          seenPlanKeys.add(planKey);
          transcriptIr.plans.push({
            eventId: makePlanId(transcriptIr.sessionId, typeof entry.uuid === "string" ? entry.uuid : undefined, contentHash, planIndex++),
            kind: "plan",
            sessionId: transcriptIr.sessionId,
            transcriptPath,
            transcriptRelativePath,
            messageId: typeof entry.uuid === "string" ? entry.uuid : undefined,
            timestamp,
            isSidechain: transcriptIr.isSidechain,
            agentId: transcriptIr.agentId,
            source: "plan_attachment",
            content,
            contentHash,
            planFilePath: typeof attachment.planFilePath === "string" ? attachment.planFilePath : undefined,
            promptEventId: lastPrompt?.eventId,
            promptMessageId: lastPrompt?.messageId
          });
        }
      }
    }
  } finally {
    lines.close();
    stream.close();
  }
  return transcriptIr;
}
async function extractCodexTranscriptIR(args) {
  const transcriptPath = args.transcript.path;
  const transcriptRelativePath = args.transcript.relativePath;
  const fallbackSessionId = args.transcript.codexMeta?.sessionId ?? validateUuid(basename(transcriptPath, ".jsonl")) ?? basename(transcriptPath, ".jsonl");
  const transcriptIr = {
    transcriptPath,
    transcriptRelativePath,
    sessionId: fallbackSessionId,
    isSidechain: args.transcript.codexMeta?.isSidechain ?? false,
    agentId: args.transcript.codexMeta?.agentId,
    prompts: [],
    plans: [],
    snapshots: [],
    codeEdits: []
  };
  let lastPrompt;
  const seenPlanKeys = new Set;
  let planIndex = 0;
  let patchIndex = 0;
  let promptIndex = 0;
  const stream = createReadStream(transcriptPath, { encoding: "utf8" });
  const lines = createInterface({
    input: stream,
    crlfDelay: Infinity
  });
  try {
    for await (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) {
        continue;
      }
      let entry;
      try {
        entry = JSON.parse(trimmed);
      } catch {
        continue;
      }
      const timestamp = maybeGetTimestamp(entry);
      applyTranscriptTimestamp(transcriptIr, timestamp);
      if (entry.type === "session_meta") {
        const payload2 = entry.payload && typeof entry.payload === "object" ? entry.payload : null;
        if (!payload2) {
          continue;
        }
        if (typeof payload2.id === "string" && validateUuid(payload2.id) !== null) {
          transcriptIr.sessionId = payload2.id;
        }
        if (typeof payload2.agent_nickname === "string") {
          transcriptIr.agentId = payload2.agent_nickname;
        }
        const source = payload2.source && typeof payload2.source === "object" ? payload2.source : null;
        if (source?.subagent) {
          transcriptIr.isSidechain = true;
        }
        continue;
      }
      if (entry.type === "event_msg") {
        const payload2 = entry.payload && typeof entry.payload === "object" ? entry.payload : null;
        if (!payload2) {
          continue;
        }
        if (payload2.type === "user_message" && typeof payload2.message === "string" && payload2.message.trim() && timestamp) {
          const fullText = payload2.message.trim();
          const messageId = typeof payload2.turn_id === "string" ? payload2.turn_id : makeSyntheticMessageId("codex-user", fullText, promptIndex);
          const promptEvent = {
            eventId: makePromptId(transcriptIr.sessionId, messageId),
            kind: "user_prompt",
            sessionId: transcriptIr.sessionId,
            transcriptPath,
            transcriptRelativePath,
            messageId,
            timestamp,
            isSidechain: transcriptIr.isSidechain,
            agentId: transcriptIr.agentId,
            fullText,
            normalizedText: fullText,
            text: fullText,
            rawContent: payload2.message
          };
          transcriptIr.prompts.push(promptEvent);
          lastPrompt = promptEvent;
          promptIndex++;
          continue;
        }
        if (payload2.type === "item_completed" && timestamp && payload2.item && typeof payload2.item === "object") {
          const item = payload2.item;
          if (item.type === "Plan" && typeof item.text === "string" && item.text.trim()) {
            const content = item.text.trim();
            const contentHash2 = hashContent2(content);
            const messageId = typeof item.id === "string" ? item.id : makeSyntheticMessageId("codex-plan", content, planIndex);
            const planKey = [
              transcriptIr.sessionId,
              messageId,
              "codex_plan",
              contentHash2
            ].join(":");
            if (seenPlanKeys.has(planKey)) {
              continue;
            }
            seenPlanKeys.add(planKey);
            transcriptIr.plans.push({
              eventId: makePlanId(transcriptIr.sessionId, messageId, contentHash2, planIndex++),
              kind: "plan",
              sessionId: transcriptIr.sessionId,
              transcriptPath,
              transcriptRelativePath,
              messageId,
              timestamp,
              isSidechain: transcriptIr.isSidechain,
              agentId: transcriptIr.agentId,
              source: "codex_plan",
              content,
              contentHash: contentHash2,
              promptEventId: lastPrompt?.eventId,
              promptMessageId: lastPrompt?.messageId
            });
          }
        }
        continue;
      }
      if (entry.type !== "response_item") {
        continue;
      }
      const payload = entry.payload && typeof entry.payload === "object" ? entry.payload : null;
      if (!payload || payload.type !== "custom_tool_call" || payload.name !== "apply_patch" || typeof payload.input !== "string" || !timestamp) {
        continue;
      }
      const files = parsePatchFileChanges({
        rootDir: args.rootDir,
        patchText: payload.input
      });
      if (files.length === 0) {
        continue;
      }
      const contentHash = hashContent2(payload.input);
      transcriptIr.codeEdits.push({
        eventId: makePatchEditId(transcriptIr.sessionId, contentHash, patchIndex++),
        kind: "code_edit",
        sessionId: transcriptIr.sessionId,
        transcriptPath,
        transcriptRelativePath,
        timestamp,
        isSidechain: transcriptIr.isSidechain,
        agentId: transcriptIr.agentId,
        promptEventId: lastPrompt?.eventId,
        promptMessageId: lastPrompt?.messageId,
        files
      });
    }
  } finally {
    lines.close();
    stream.close();
  }
  return transcriptIr;
}
async function extractTranscriptIR(args) {
  if (args.transcript.sourceKind === "codex_session") {
    return extractCodexTranscriptIR(args);
  }
  return extractProjectContextTranscriptIR({
    transcript: args.transcript
  });
}
function countPatchLines(hunks) {
  let additions = 0;
  let deletions = 0;
  for (const hunk of hunks) {
    for (const line of hunk.lines) {
      if (line.startsWith("+") && !line.startsWith("+++")) {
        additions++;
      } else if (line.startsWith("-") && !line.startsWith("---")) {
        deletions++;
      }
    }
  }
  return { additions, deletions };
}
function formatLineRange(startLine, lineCount) {
  const safeStart = Math.max(1, startLine);
  const safeEnd = Math.max(safeStart, safeStart + Math.max(1, lineCount) - 1);
  return `L${safeStart}::L${safeEnd}`;
}
function buildCompactLineRanges(hunks) {
  const ranges = [];
  for (const hunk of hunks) {
    if (hunk.newLines > 0) {
      ranges.push(formatLineRange(hunk.newStart, hunk.newLines));
      continue;
    }
    if (hunk.oldLines > 0) {
      ranges.push(formatLineRange(hunk.oldStart, hunk.oldLines));
    }
  }
  return [...new Set(ranges)];
}
function getRelativeFilePath(rootDir, filePath) {
  const normalizedRoot = resolve2(rootDir);
  const normalizedPath = resolve2(filePath);
  if (normalizedPath === normalizedRoot || normalizedPath.startsWith(`${normalizedRoot}/`)) {
    return toPosixPath2(relative3(normalizedRoot, normalizedPath));
  }
  return toPosixPath2(normalizedPath);
}
async function readBackupContent(fileHistoryDir, sessionId, backupFileName) {
  if (backupFileName === undefined || backupFileName === null) {
    return null;
  }
  const backupPath = join6(fileHistoryDir, sessionId, backupFileName);
  try {
    return await readFile(backupPath, "utf8");
  } catch {
    return null;
  }
}
function buildStructuredPatch(args) {
  const result = structuredPatch(args.filePath, args.filePath, args.oldContent, args.newContent, undefined, undefined, {
    context: DIFF_CONTEXT_LINES
  });
  return result?.hunks ?? [];
}
async function buildCodeEditEvents(args) {
  const promptByMessageId = new Map(args.transcript.prompts.map((prompt) => [prompt.messageId, prompt]));
  const events = [...args.transcript.codeEdits];
  for (let index = 1;index < args.transcript.snapshots.length; index++) {
    const previousSnapshot = args.transcript.snapshots[index - 1];
    const currentSnapshot = args.transcript.snapshots[index];
    if (!previousSnapshot || !currentSnapshot) {
      continue;
    }
    const trackedPaths = new Set([
      ...Object.keys(previousSnapshot.trackedFileBackups),
      ...Object.keys(currentSnapshot.trackedFileBackups)
    ]);
    const files = [];
    for (const trackedPath of trackedPaths) {
      const previousBackup = previousSnapshot.trackedFileBackups[trackedPath];
      const currentBackup = currentSnapshot.trackedFileBackups[trackedPath];
      if (previousBackup?.backupFileName === currentBackup?.backupFileName && previousBackup?.version === currentBackup?.version) {
        continue;
      }
      const absolutePath = trackedPath.startsWith("/") ? trackedPath : resolve2(args.rootDir, trackedPath);
      const previousContent = await readBackupContent(args.fileHistoryDir, args.transcript.sessionId, previousBackup?.backupFileName);
      const currentContent = await readBackupContent(args.fileHistoryDir, args.transcript.sessionId, currentBackup?.backupFileName);
      if (previousContent === null && currentContent === null) {
        continue;
      }
      const status = previousContent === null ? "added" : currentContent === null ? "deleted" : "modified";
      const hunks = buildStructuredPatch({
        filePath: absolutePath,
        oldContent: previousContent ?? "",
        newContent: currentContent ?? ""
      });
      const { additions, deletions } = countPatchLines(hunks);
      const lineRanges = buildCompactLineRanges(hunks);
      files.push(buildStoredFileChange({
        absolutePath,
        relativePath: getRelativeFilePath(args.rootDir, absolutePath),
        status,
        additions,
        deletions,
        lineRanges,
        diffText: renderStructuredDiffText({
          relativePath: getRelativeFilePath(args.rootDir, absolutePath),
          status,
          hunks
        }),
        beforeContent: previousContent,
        afterContent: currentContent
      }));
    }
    if (files.length === 0) {
      continue;
    }
    const prompt = promptByMessageId.get(previousSnapshot.messageId);
    events.push({
      eventId: makeEditId(args.transcript.sessionId, previousSnapshot.messageId, currentSnapshot.messageId),
      kind: "code_edit",
      sessionId: args.transcript.sessionId,
      transcriptPath: args.transcript.transcriptPath,
      transcriptRelativePath: args.transcript.transcriptRelativePath,
      timestamp: currentSnapshot.timestamp,
      isSidechain: args.transcript.isSidechain,
      agentId: args.transcript.agentId,
      fromSnapshotMessageId: previousSnapshot.messageId,
      toSnapshotMessageId: currentSnapshot.messageId,
      promptEventId: prompt?.eventId,
      promptMessageId: prompt?.messageId,
      files
    });
  }
  return events;
}
function truncatePreview2(value, maxChars = 160) {
  const flattened = value.replace(/\s+/g, " ").trim();
  if (flattened.length <= maxChars) {
    return flattened;
  }
  return `${flattened.slice(0, maxChars - 1)}…`;
}
function toPythonSymbol(value, prefix) {
  const ascii = value.normalize("NFKD").replace(/[^\x00-\x7F]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  const fallback = `${prefix}_${hashContent2(value).slice(0, 10)}`;
  const body = ascii ? `${prefix}_${ascii}` : fallback;
  const cleaned = body.replace(/_+/g, "_").replace(/^(\d)/, "_$1");
  return cleaned.length <= 48 ? cleaned : `${prefix}_${hashContent2(value).slice(0, 10)}`;
}
function sortByTimestamp(items) {
  return [...items].sort((left, right) => (left.timestamp ?? "").localeCompare(right.timestamp ?? ""));
}
function dedupeByKey2(items, getKey) {
  const seen = new Set;
  const result = [];
  for (const item of items) {
    const key = getKey(item);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(item);
  }
  return result;
}
function buildFileStats(codeEdits) {
  const byPath = new Map;
  for (const edit of codeEdits) {
    for (const file of edit.files) {
      const existing = byPath.get(file.absolutePath);
      if (existing) {
        existing.touchCount += 1;
        if (edit.timestamp >= existing.lastEditedAt) {
          existing.lastEditedAt = edit.timestamp;
          existing.lastEditEventId = edit.eventId;
        }
        continue;
      }
      byPath.set(file.absolutePath, {
        absolutePath: file.absolutePath,
        relativePath: file.relativePath,
        touchCount: 1,
        lastEditedAt: edit.timestamp,
        lastEditEventId: edit.eventId
      });
    }
  }
  return [...byPath.values()].sort((left, right) => {
    if (right.touchCount !== left.touchCount) {
      return right.touchCount - left.touchCount;
    }
    return right.lastEditedAt.localeCompare(left.lastEditedAt);
  });
}
function buildTranscriptSummaries(args) {
  return args.transcripts.map((transcript) => ({
    transcriptId: makeTranscriptId(transcript.transcriptRelativePath),
    transcriptPath: transcript.transcriptPath,
    relativePath: transcript.transcriptRelativePath,
    sessionId: transcript.sessionId,
    isSidechain: transcript.isSidechain,
    agentId: transcript.agentId,
    firstTimestamp: transcript.firstTimestamp,
    lastTimestamp: transcript.lastTimestamp,
    promptCount: transcript.prompts.length,
    planCount: transcript.plans.length,
    codeEditCount: args.codeEditCounts.get(transcript.transcriptPath) ?? 0
  }));
}
function buildSessionSummaries(args) {
  const bySession = new Map;
  const ensureSession = (sessionId) => {
    let existing = bySession.get(sessionId);
    if (existing) {
      return existing;
    }
    existing = {
      sessionId,
      transcriptRelativePaths: new Set,
      promptCount: 0,
      planCount: 0,
      codeEditCount: 0,
      fileTouches: new Map,
      agentIds: new Set
    };
    bySession.set(sessionId, existing);
    return existing;
  };
  const updateTimestampBounds = (target, timestamp) => {
    if (!timestamp) {
      return;
    }
    if (!target.firstTimestamp || timestamp < target.firstTimestamp) {
      target.firstTimestamp = timestamp;
    }
    if (!target.lastTimestamp || timestamp > target.lastTimestamp) {
      target.lastTimestamp = timestamp;
    }
  };
  for (const transcript of args.transcripts) {
    const session = ensureSession(transcript.sessionId);
    session.transcriptRelativePaths.add(transcript.relativePath);
    if (transcript.agentId) {
      session.agentIds.add(transcript.agentId);
    }
    updateTimestampBounds(session, transcript.firstTimestamp);
    updateTimestampBounds(session, transcript.lastTimestamp);
  }
  for (const prompt of args.prompts) {
    const session = ensureSession(prompt.sessionId);
    session.promptCount += 1;
    session.transcriptRelativePaths.add(prompt.transcriptRelativePath);
    if (prompt.agentId) {
      session.agentIds.add(prompt.agentId);
    }
    updateTimestampBounds(session, prompt.timestamp);
    if (!session.latestPromptTimestamp || prompt.timestamp >= session.latestPromptTimestamp) {
      session.latestPromptTimestamp = prompt.timestamp;
      session.latestPromptPreview = truncatePreview2(getPromptPreview(prompt), 160);
    }
  }
  for (const plan of args.plans) {
    const session = ensureSession(plan.sessionId);
    session.planCount += 1;
    session.transcriptRelativePaths.add(plan.transcriptRelativePath);
    if (plan.agentId) {
      session.agentIds.add(plan.agentId);
    }
    updateTimestampBounds(session, plan.timestamp);
    if (!session.latestPlanTimestamp || plan.timestamp >= session.latestPlanTimestamp) {
      session.latestPlanTimestamp = plan.timestamp;
      session.latestPlanPreview = truncatePreview2(plan.content, 160);
    }
  }
  for (const edit of args.codeEdits) {
    const session = ensureSession(edit.sessionId);
    session.codeEditCount += 1;
    session.transcriptRelativePaths.add(edit.transcriptRelativePath);
    if (edit.agentId) {
      session.agentIds.add(edit.agentId);
    }
    updateTimestampBounds(session, edit.timestamp);
    for (const file of edit.files) {
      session.fileTouches.set(file.relativePath, (session.fileTouches.get(file.relativePath) ?? 0) + 1);
    }
  }
  return [...bySession.values()].map((session) => ({
    sessionId: session.sessionId,
    transcriptCount: session.transcriptRelativePaths.size,
    transcriptRelativePaths: [...session.transcriptRelativePaths].sort((left, right) => left.localeCompare(right)),
    promptCount: session.promptCount,
    planCount: session.planCount,
    codeEditCount: session.codeEditCount,
    firstTimestamp: session.firstTimestamp,
    lastTimestamp: session.lastTimestamp,
    latestPromptPreview: session.latestPromptPreview,
    latestPlanPreview: session.latestPlanPreview,
    topFiles: [...session.fileTouches.entries()].sort((left, right) => {
      if (right[1] !== left[1]) {
        return right[1] - left[1];
      }
      return left[0].localeCompare(right[0]);
    }).slice(0, 5).map(([path, touches]) => ({
      path,
      touches
    })),
    agentIds: [...session.agentIds].sort((left, right) => left.localeCompare(right))
  })).sort((left, right) => (right.lastTimestamp ?? "").localeCompare(left.lastTimestamp ?? ""));
}
function buildEdges(args) {
  const edges = [];
  const pushEdge = (kind, source, target) => {
    edges.push({
      edgeId: `edge-${String(edges.length + 1).padStart(6, "0")}`,
      kind,
      source,
      target
    });
  };
  const transcriptIds = new Map(args.transcripts.map((transcript) => [
    transcript.relativePath,
    transcript.transcriptId
  ]));
  for (const prompt of args.prompts) {
    const transcriptId = transcriptIds.get(prompt.transcriptRelativePath);
    if (transcriptId) {
      pushEdge("contains", transcriptId, prompt.eventId);
    }
  }
  for (const plan of args.plans) {
    const transcriptId = transcriptIds.get(plan.transcriptRelativePath);
    if (transcriptId) {
      pushEdge("contains", transcriptId, plan.eventId);
    }
    if (plan.promptEventId) {
      pushEdge("planned", plan.promptEventId, plan.eventId);
    }
  }
  for (const edit of args.codeEdits) {
    const transcriptId = transcriptIds.get(edit.transcriptRelativePath);
    if (transcriptId) {
      pushEdge("contains", transcriptId, edit.eventId);
    }
    if (edit.promptEventId) {
      pushEdge("led_to", edit.promptEventId, edit.eventId);
    }
    for (const file of edit.files) {
      pushEdge("touches_file", edit.eventId, makeFileId(file.relativePath));
    }
  }
  return edges;
}
function summarizeLineRanges(lineRanges) {
  return [...new Set(lineRanges.filter(Boolean))].slice(0, 3).join(", ");
}
function isLowSignalMemoryPrompt(value) {
  if (!value) {
    return true;
  }
  return value.length < 4 || /^\[(request interrupted|interrupted)/iu.test(value) || /task-notification>|<task-notification>|<tool-use-id>|<output-file>/iu.test(value) || /^(是|对|好|继续|hello)[，。!！?？\s]*$/u.test(value);
}
function makeMemorySegmentId(kind, anchor) {
  return `${kind}_${hashContent2(`${kind}:${anchor}`).slice(0, 12)}`;
}
function findMentionedFilePaths(text, candidatePaths, limit = 8) {
  const haystack = text.toLowerCase();
  return candidatePaths.filter((path) => haystack.includes(path.toLowerCase())).slice(0, limit);
}
function summarizeStoredLineRanges(file) {
  const summarized = summarizeLineRanges(file.lineRanges);
  if (summarized) {
    return summarized;
  }
  return file.contentKind === "non_code_text" ? "full_text" : "diff_only";
}
function buildMemoryGraphSegments(args) {
  const memoryIdsBySourceEventId = new Map;
  for (const memoryObject of args.memoryObjects) {
    for (const eventId of memoryObject.sourceEventIds) {
      const existing = memoryIdsBySourceEventId.get(eventId) ?? [];
      memoryIdsBySourceEventId.set(eventId, dedupeByKey2([...existing, memoryObject.objectId], (value) => value));
    }
  }
  const plansByPromptEventId = new Map;
  const plansByPromptMessageId = new Map;
  for (const plan of args.plans) {
    if (plan.promptEventId) {
      const existing = plansByPromptEventId.get(plan.promptEventId) ?? [];
      plansByPromptEventId.set(plan.promptEventId, dedupeByKey2([...existing, plan.eventId], (value) => value));
    }
    if (plan.promptMessageId) {
      const existing = plansByPromptMessageId.get(plan.promptMessageId) ?? [];
      plansByPromptMessageId.set(plan.promptMessageId, dedupeByKey2([...existing, plan.eventId], (value) => value));
    }
  }
  const promptSegments = sortByTimestamp(args.prompts.filter((prompt) => args.selectedSessionIds.has(prompt.sessionId))).filter((prompt) => {
    const preview = getPromptPreview(prompt);
    return !isLowSignalMemoryPrompt(preview) || (plansByPromptEventId.get(prompt.eventId)?.length ?? 0) > 0 || (plansByPromptMessageId.get(prompt.messageId)?.length ?? 0) > 0 || (memoryIdsBySourceEventId.get(prompt.eventId)?.length ?? 0) > 0;
  }).slice(-24).map((prompt) => {
    const preview = truncatePreview2(getPromptPreview(prompt), 180);
    const filePaths = findMentionedFilePaths(`${prompt.normalizedText}
${prompt.fullText}`, args.selectedFilePaths);
    const planIds = dedupeByKey2([
      ...plansByPromptEventId.get(prompt.eventId) ?? [],
      ...plansByPromptMessageId.get(prompt.messageId) ?? []
    ], (value) => value).slice(0, 6);
    return {
      segmentId: makeMemorySegmentId("prompt", `${prompt.eventId}:${prompt.timestamp}`),
      kind: "prompt",
      sessionId: prompt.sessionId,
      timestamp: prompt.timestamp,
      title: preview,
      summary: preview,
      sourceEventIds: [prompt.eventId],
      filePaths,
      planIds,
      memoryObjectIds: (memoryIdsBySourceEventId.get(prompt.eventId) ?? []).slice(0, 6),
      recentRanges: []
    };
  });
  const planSegments = sortByTimestamp(args.plans.filter((plan) => args.selectedSessionIds.has(plan.sessionId))).slice(-24).map((plan) => ({
    segmentId: makeMemorySegmentId("plan", `${plan.eventId}:${plan.timestamp}`),
    kind: "plan",
    sessionId: plan.sessionId,
    timestamp: plan.timestamp,
    title: truncatePreview2(plan.content, 140),
    summary: truncatePreview2(plan.content, 220),
    sourceEventIds: [plan.eventId],
    filePaths: findMentionedFilePaths(plan.content, args.selectedFilePaths),
    planIds: [plan.eventId],
    memoryObjectIds: (memoryIdsBySourceEventId.get(plan.eventId) ?? []).slice(0, 6),
    recentRanges: []
  }));
  const editSegments = sortByTimestamp(args.codeEdits.filter((edit) => args.selectedSessionIds.has(edit.sessionId))).slice(-24).map((edit) => {
    const planIds = dedupeByKey2([
      ...edit.promptEventId ? plansByPromptEventId.get(edit.promptEventId) ?? [] : [],
      ...edit.promptMessageId ? plansByPromptMessageId.get(edit.promptMessageId) ?? [] : []
    ], (value) => value).slice(0, 6);
    const filePaths = dedupeByKey2(edit.files.map((file) => file.relativePath), (value) => value).slice(0, 8);
    const summary = truncatePreview2(edit.files.map((file) => `${file.relativePath} (${file.status}${(() => {
      const ranges = summarizeStoredLineRanges(file);
      return ranges ? ` ${ranges}` : "";
    })()})`).join(", "), 220);
    return {
      segmentId: makeMemorySegmentId("edit", `${edit.eventId}:${edit.timestamp}`),
      kind: edit.files.every((file) => file.contentKind === "non_code_text") ? "non_code_text_edit" : "code_edit",
      sessionId: edit.sessionId,
      timestamp: edit.timestamp,
      title: truncatePreview2(filePaths.length === 1 ? `${edit.files[0].contentKind === "non_code_text" ? "Text" : "Code"} edit ${filePaths[0]}` : `${filePaths.length} file edit`, 140),
      summary,
      sourceEventIds: [
        edit.eventId,
        ...edit.promptEventId ? [edit.promptEventId] : []
      ],
      filePaths,
      planIds,
      memoryObjectIds: edit.promptEventId ? (memoryIdsBySourceEventId.get(edit.promptEventId) ?? []).slice(0, 6) : [],
      recentRanges: edit.files.slice(0, 8).map((file) => ({
        path: file.relativePath,
        status: file.status,
        lineRanges: summarizeStoredLineRanges(file)
      }))
    };
  });
  return sortByTimestamp(dedupeByKey2([...promptSegments, ...planSegments, ...editSegments], (segment) => segment.segmentId)).slice(-MEMORY_GRAPH_SEGMENT_LIMIT);
}
function buildMemoryGraphAnalysisInput(args) {
  const promptsBySession = new Map;
  const plansBySession = new Map;
  const memoryObjectsBySession = new Map;
  const editsBySession = new Map;
  const filePlanIds = new Map;
  const fileMemoryIds = new Map;
  const fileSessionIds = new Map;
  const fileRecentRanges = new Map;
  for (const prompt of sortByTimestamp(args.prompts)) {
    const preview = truncatePreview2(getPromptPreview(prompt), 160);
    const existing = promptsBySession.get(prompt.sessionId) ?? [];
    promptsBySession.set(prompt.sessionId, dedupeByKey2([...existing, preview], (value) => value).slice(-6));
  }
  for (const plan of sortByTimestamp(args.plans)) {
    const existing = plansBySession.get(plan.sessionId) ?? [];
    plansBySession.set(plan.sessionId, dedupeByKey2([...existing, plan.eventId], (value) => value).slice(-6));
  }
  for (const memoryObject of args.memoryObjects) {
    for (const sessionId of memoryObject.sessionIds) {
      const existing = memoryObjectsBySession.get(sessionId) ?? [];
      memoryObjectsBySession.set(sessionId, [...existing, memoryObject]);
    }
  }
  for (const edit of sortByTimestamp(args.codeEdits)) {
    for (const file of edit.files) {
      const lineRanges = summarizeLineRanges(file.lineRanges);
      const sessionEdits = editsBySession.get(edit.sessionId) ?? [];
      sessionEdits.push({
        path: file.relativePath,
        status: file.status,
        lineRanges,
        timestamp: edit.timestamp
      });
      editsBySession.set(edit.sessionId, sessionEdits);
      const sessionIds = fileSessionIds.get(file.relativePath) ?? new Set;
      sessionIds.add(edit.sessionId);
      fileSessionIds.set(file.relativePath, sessionIds);
      const recentRanges = fileRecentRanges.get(file.relativePath) ?? [];
      recentRanges.push({
        sessionId: edit.sessionId,
        status: file.status,
        lineRanges
      });
      fileRecentRanges.set(file.relativePath, recentRanges);
      if (edit.promptEventId) {
        const relatedPlanIds = plansBySession.get(edit.sessionId) ?? [];
        const planIds = filePlanIds.get(file.relativePath) ?? new Set;
        for (const planId of relatedPlanIds) {
          planIds.add(planId);
        }
        filePlanIds.set(file.relativePath, planIds);
      }
    }
  }
  for (const memoryObject of args.memoryObjects) {
    for (const sessionId of memoryObject.sessionIds) {
      const session = args.sessions.find((candidate) => candidate.sessionId === sessionId);
      for (const file of session?.topFiles ?? []) {
        const ids = fileMemoryIds.get(file.path) ?? new Set;
        ids.add(memoryObject.objectId);
        fileMemoryIds.set(file.path, ids);
      }
    }
  }
  const sessionChronology = [...args.sessions].sort((left, right) => (left.lastTimestamp ?? "").localeCompare(right.lastTimestamp ?? ""));
  const sessionNeighbors = new Map;
  for (let index = 0;index < sessionChronology.length; index++) {
    const session = sessionChronology[index];
    if (!session) {
      continue;
    }
    sessionNeighbors.set(session.sessionId, {
      previousSessionId: sessionChronology[index - 1]?.sessionId ?? null,
      nextSessionId: sessionChronology[index + 1]?.sessionId ?? null
    });
  }
  const selectedSessions = args.sessions.filter((session) => session.planCount > 0 || session.codeEditCount > 0 || (memoryObjectsBySession.get(session.sessionId)?.length ?? 0) > 0 || session.promptCount > 2 && !isLowSignalMemoryPrompt((promptsBySession.get(session.sessionId) ?? []).slice().reverse().find((prompt) => !isLowSignalMemoryPrompt(prompt)))).slice(0, 18);
  const selectedSessionIds = new Set(selectedSessions.map((session) => session.sessionId));
  const selectedPlans = dedupeByKey2(args.plans.filter((plan) => selectedSessionIds.has(plan.sessionId)).slice().reverse().map((plan) => ({
    eventId: plan.eventId,
    sessionId: plan.sessionId,
    timestamp: plan.timestamp,
    source: plan.source,
    preview: truncatePreview2(plan.content, 180),
    transcriptRelativePath: plan.transcriptRelativePath,
    planFilePath: plan.planFilePath
  })), (plan) => plan.eventId).slice(0, 24);
  const selectedFilePaths = dedupeByKey2([
    ...selectedSessions.flatMap((session) => session.topFiles.map((file) => file.path)),
    ...selectedSessions.flatMap((session) => (editsBySession.get(session.sessionId) ?? []).map((edit) => edit.path)),
    ...args.files.slice(0, 12).map((file) => file.relativePath)
  ], (value) => value);
  const selectedFiles = args.files.filter((file) => selectedFilePaths.includes(file.relativePath)).slice(0, 28).map((file) => ({
    path: file.relativePath,
    touchCount: file.touchCount,
    lastEditedAt: file.lastEditedAt,
    lastEditEventId: file.lastEditEventId,
    sessionIds: [...fileSessionIds.get(file.relativePath) ?? new Set].filter((sessionId) => selectedSessionIds.has(sessionId)).slice(0, 8),
    planIds: [...filePlanIds.get(file.relativePath) ?? new Set].slice(0, 8),
    memoryObjectIds: [...fileMemoryIds.get(file.relativePath) ?? new Set].slice(0, 8),
    recentRanges: dedupeByKey2((fileRecentRanges.get(file.relativePath) ?? []).slice().reverse(), (range) => `${range.sessionId}|${range.status}|${range.lineRanges || "-"}`).slice(0, 5)
  }));
  const selectedMemoryObjects = dedupeByKey2(args.memoryObjects.filter((memoryObject) => memoryObject.sessionIds.some((sessionId) => selectedSessionIds.has(sessionId))).map((memoryObject) => ({
    objectId: memoryObject.objectId,
    kind: memoryObject.kind,
    status: memoryObject.status,
    lastSeenAt: memoryObject.lastSeenAt,
    statement: memoryObject.statement,
    sessionIds: memoryObject.sessionIds.filter((sessionId) => selectedSessionIds.has(sessionId))
  })), (memoryObject) => memoryObject.objectId).slice(0, 24);
  const selectedSessionsFacts = selectedSessions.map((session) => {
    const promptPreviews = (promptsBySession.get(session.sessionId) ?? []).slice().reverse();
    const focusPrompt = promptPreviews.find((prompt) => !isLowSignalMemoryPrompt(prompt));
    const recentEdits = dedupeByKey2((editsBySession.get(session.sessionId) ?? []).slice().reverse(), (edit) => `${edit.path}|${edit.status}|${edit.lineRanges || "-"}`).slice(0, 6);
    return {
      sessionId: session.sessionId,
      firstTimestamp: session.firstTimestamp,
      lastTimestamp: session.lastTimestamp,
      promptCount: session.promptCount,
      planCount: session.planCount,
      codeEditCount: session.codeEditCount,
      latestPromptPreview: session.latestPromptPreview,
      latestPlanPreview: session.latestPlanPreview,
      focusPrompt,
      topFiles: session.topFiles.slice(0, 6),
      agentIds: session.agentIds,
      promptPreviews: promptPreviews.slice(0, 4),
      planIds: (plansBySession.get(session.sessionId) ?? []).slice(-4),
      memoryObjectIds: (memoryObjectsBySession.get(session.sessionId) ?? []).slice(0, 6).map((memoryObject) => memoryObject.objectId),
      recentEdits,
      previousSessionId: sessionNeighbors.get(session.sessionId)?.previousSessionId ?? null,
      nextSessionId: sessionNeighbors.get(session.sessionId)?.nextSessionId ?? null
    };
  });
  const selectedSegments = buildMemoryGraphSegments({
    selectedSessionIds,
    selectedFilePaths,
    prompts: args.prompts,
    plans: args.plans,
    codeEdits: args.codeEdits,
    memoryObjects: args.memoryObjects.filter((memoryObject) => memoryObject.sessionIds.some((sessionId) => selectedSessionIds.has(sessionId)))
  });
  return {
    rootDir: args.manifest.rootDir,
    generatedAt: args.manifest.createdAt,
    sessions: selectedSessionsFacts,
    files: selectedFiles,
    plans: selectedPlans,
    memoryObjects: selectedMemoryObjects,
    segments: selectedSegments
  };
}
function renderDotGraph(args) {
  const recentPrompts = sortByTimestamp(args.prompts).slice(-60);
  const recentPlans = sortByTimestamp(args.plans).slice(-40);
  const recentEdits = sortByTimestamp(args.codeEdits).slice(-60);
  const transcriptIds = new Set;
  const promptIds = new Set(recentPrompts.map((prompt) => prompt.eventId));
  const planIds = new Set(recentPlans.map((plan) => plan.eventId));
  const editIds = new Set(recentEdits.map((edit) => edit.eventId));
  const fileIds = new Set;
  for (const prompt of recentPrompts) {
    transcriptIds.add(makeTranscriptId(prompt.transcriptRelativePath));
  }
  for (const plan of recentPlans) {
    transcriptIds.add(makeTranscriptId(plan.transcriptRelativePath));
  }
  for (const edit of recentEdits) {
    transcriptIds.add(makeTranscriptId(edit.transcriptRelativePath));
    for (const file of edit.files) {
      fileIds.add(makeFileId(file.relativePath));
    }
  }
  for (const file of args.files.slice(0, 25)) {
    fileIds.add(makeFileId(file.relativePath));
  }
  const lines = ["digraph memory_index {", "  rankdir=LR;", "  node [shape=box];"];
  for (const transcript of args.transcripts) {
    if (!transcriptIds.has(transcript.transcriptId)) {
      continue;
    }
    lines.push(`  ${JSON.stringify(transcript.transcriptId)} [shape=folder,label=${JSON.stringify(`transcript\\n${transcript.relativePath}`)}];`);
  }
  for (const prompt of recentPrompts) {
    lines.push(`  ${JSON.stringify(prompt.eventId)} [shape=note,label=${JSON.stringify(`prompt\\n${truncatePreview2(getPromptPreview(prompt), 72)}`)}];`);
  }
  for (const plan of recentPlans) {
    lines.push(`  ${JSON.stringify(plan.eventId)} [shape=component,label=${JSON.stringify(`plan\\n${truncatePreview2(plan.content, 72)}`)}];`);
  }
  for (const edit of recentEdits) {
    const editedFiles = edit.files.slice(0, 3).map((file) => file.relativePath).join("\\n");
    lines.push(`  ${JSON.stringify(edit.eventId)} [shape=box3d,label=${JSON.stringify(`edit\\n${editedFiles || "files"}`)}];`);
  }
  for (const file of args.files) {
    const fileId = makeFileId(file.relativePath);
    if (!fileIds.has(fileId)) {
      continue;
    }
    lines.push(`  ${JSON.stringify(fileId)} [shape=ellipse,label=${JSON.stringify(`file\\n${file.relativePath}`)}];`);
  }
  let renderedEdges = 0;
  for (const edge of args.edges) {
    const sourceIncluded = transcriptIds.has(edge.source) || promptIds.has(edge.source) || planIds.has(edge.source) || editIds.has(edge.source) || fileIds.has(edge.source);
    const targetIncluded = transcriptIds.has(edge.target) || promptIds.has(edge.target) || planIds.has(edge.target) || editIds.has(edge.target) || fileIds.has(edge.target);
    if (!sourceIncluded || !targetIncluded) {
      continue;
    }
    if (renderedEdges >= DOT_EVENT_LIMIT * 3) {
      break;
    }
    lines.push(`  ${JSON.stringify(edge.source)} -> ${JSON.stringify(edge.target)} [label=${JSON.stringify(edge.kind)}];`);
    renderedEdges++;
  }
  lines.push("}");
  return lines.join(`
`) + `
`;
}
function renderSessionsDot(args) {
  const overviewSessions = args.sessions.slice(0, SESSION_DOT_OVERVIEW_LIMIT);
  const fileIds = new Set;
  const fileLabels = new Map;
  for (const session of overviewSessions) {
    for (const file of session.topFiles.slice(0, SESSION_DOT_FILE_LIMIT)) {
      const fileId = makeFileId(file.path);
      fileIds.add(fileId);
      fileLabels.set(fileId, file.path);
    }
  }
  const lines = ["digraph memory_sessions {", "  rankdir=LR;", "  node [shape=box];"];
  for (const session of overviewSessions) {
    const shortSessionId = session.sessionId.slice(0, 8);
    const labelParts = [
      `session\\n${shortSessionId}`,
      `${session.lastTimestamp ?? "unknown time"}`,
      `transcripts:${session.transcriptCount} prompts:${session.promptCount} plans:${session.planCount} edits:${session.codeEditCount}`
    ];
    if (session.latestPromptPreview) {
      labelParts.push(`prompt: ${truncatePreview2(session.latestPromptPreview, 72)}`);
    }
    if (session.latestPlanPreview) {
      labelParts.push(`plan: ${truncatePreview2(session.latestPlanPreview, 72)}`);
    }
    lines.push(`  ${JSON.stringify(`session:${session.sessionId}`)} [shape=folder,label=${JSON.stringify(labelParts.join("\\n"))}];`);
  }
  for (const [fileId, filePath] of fileLabels.entries()) {
    lines.push(`  ${JSON.stringify(fileId)} [shape=ellipse,label=${JSON.stringify(`file\\n${filePath}`)}];`);
  }
  const chronologicalSessions = [...overviewSessions].sort((left, right) => (left.lastTimestamp ?? "").localeCompare(right.lastTimestamp ?? ""));
  for (let index = 1;index < chronologicalSessions.length; index++) {
    const previous = chronologicalSessions[index - 1];
    const current = chronologicalSessions[index];
    if (!previous || !current) {
      continue;
    }
    lines.push(`  ${JSON.stringify(`session:${previous.sessionId}`)} -> ${JSON.stringify(`session:${current.sessionId}`)} [label="next_session",color="gray60"];`);
  }
  for (const session of overviewSessions) {
    for (const file of session.topFiles.slice(0, SESSION_DOT_FILE_LIMIT)) {
      lines.push(`  ${JSON.stringify(`session:${session.sessionId}`)} -> ${JSON.stringify(makeFileId(file.path))} [label=${JSON.stringify(`touches ${file.touches}`)}];`);
    }
  }
  lines.push("}");
  return lines.join(`
`) + `
`;
}
function renderSummary(args) {
  const recentPrompts = sortByTimestamp(args.prompts).slice(-10).reverse();
  const recentPlans = sortByTimestamp(args.plans).slice(-5).reverse();
  const recentEdits = sortByTimestamp(args.codeEdits).slice(-10).reverse();
  const memoryObjectCounts = countMemoryObjectsByKind(args.memoryObjects);
  const compareDurableMemoryObjects = (left, right) => right.sessionIds.length - left.sessionIds.length || right.evidence.length - left.evidence.length || right.confidence - left.confidence || right.lastSeenAt.localeCompare(left.lastSeenAt);
  const activePreferences = args.memoryObjects.filter((object) => object.kind === "user_preference" && object.status === "active");
  activePreferences.sort(compareDurableMemoryObjects);
  const activeConstraints = args.memoryObjects.filter((object) => object.kind === "stable_constraint" && object.status === "active");
  activeConstraints.sort(compareDurableMemoryObjects);
  const recentRationales = args.memoryObjects.filter((object) => object.kind === "decision_rationale");
  const supersededDecisions = args.memoryObjects.filter((object) => object.kind === "superseded_decision");
  const lines = [
    "# Memory Index Summary",
    "",
    `- root: ${args.manifest.rootDir}`,
    `- output: ${args.manifest.outputDir}`,
    `- transcripts_dir: ${args.manifest.transcriptsDir}`,
    `- file_history_dir: ${args.manifest.fileHistoryDir}`,
    `- codex_sessions_dir: ${args.manifest.codexSessionsDir}`,
    `- source_inputs: ${MEMORY_SOURCE_INPUTS_DESCRIPTION}`,
    `- transcripts: ${args.manifest.transcriptCount}`,
    `- sessions: ${args.manifest.sessionCount}`,
    `- user_prompts: ${args.manifest.userPromptCount}`,
    `- plans: ${args.manifest.planCount}`,
    `- code_edits: ${args.manifest.codeEditCount}`,
    `- memory_objects: ${args.manifest.memoryObjectCount}`,
    `- files_touched: ${args.manifest.fileCount}`,
    `- relations: ${args.manifest.edgeCount}`,
    `- max_transcripts: ${args.manifest.maxTranscripts ?? "none"}`,
    `- project_memory_graph_py: ${join6(args.manifest.outputDir, "project_memory_graph.py")}`,
    `- skeleton_index_py: ${join6(args.manifest.outputDir, "skeleton", "__index__.py")}`,
    `- dot_manifest_json: ${join6(args.manifest.outputDir, "index", "dot", "manifest.json")}`,
    `- source_of_truth: ${MEMORY_SOURCE_OF_TRUTH_DESCRIPTION}`,
    `- derived_semantic_layer: index/memory_objects.jsonl -> user_preference: ${memoryObjectCounts.user_preference} | stable_constraint: ${memoryObjectCounts.stable_constraint} | decision_rationale: ${memoryObjectCounts.decision_rationale} | superseded_decision: ${memoryObjectCounts.superseded_decision}`,
    "- compact_summaries_not_source_of_truth: .claude/context/session_state.py | .claude/context/session_history.py | .claude/context/session_metrics.py",
    "",
    "## Recent Prompts",
    ...recentPrompts.length > 0 ? recentPrompts.map((prompt) => `- ${prompt.timestamp} | ${prompt.transcriptRelativePath} | ${truncatePreview2(getPromptPreview(prompt), 200)}`) : ["- none"],
    "",
    "## Recent Plans",
    ...recentPlans.length > 0 ? recentPlans.map((plan) => `- ${plan.timestamp} | ${plan.source} | ${truncatePreview2(plan.content, 200)}`) : ["- none"],
    "",
    "## Active Preferences",
    ...activePreferences.length > 0 ? activePreferences.slice(0, 8).map((object) => `- ${truncatePreview2(object.statement, 180)} | sessions: ${object.sessionIds.length} | evidence: ${object.evidence.length} | confidence: ${object.confidence.toFixed(2)} | last_seen: ${object.lastSeenAt}`) : ["- none"],
    "",
    "## Active Constraints",
    ...activeConstraints.length > 0 ? activeConstraints.slice(0, 8).map((object) => `- ${truncatePreview2(object.statement, 180)} | sessions: ${object.sessionIds.length} | evidence: ${object.evidence.length} | confidence: ${object.confidence.toFixed(2)} | last_seen: ${object.lastSeenAt}`) : ["- none"],
    "",
    "## Decision Rationales",
    ...recentRationales.length > 0 ? recentRationales.slice(0, 8).map((object) => `- ${truncatePreview2(object.statement, 180)} | last_seen: ${object.lastSeenAt}`) : ["- none"],
    "",
    "## Superseded Decisions",
    ...supersededDecisions.length > 0 ? supersededDecisions.slice(0, 8).map((object) => {
      const change = object.supersededStatement && object.replacementStatement ? `${object.supersededStatement} -> ${object.replacementStatement}` : object.statement;
      return `- ${truncatePreview2(change, 180)} | last_seen: ${object.lastSeenAt}`;
    }) : ["- none"],
    "",
    "## Most Edited Files",
    ...args.files.length > 0 ? args.files.slice(0, 20).map((file) => `- ${file.relativePath} | touches: ${file.touchCount}`) : ["- none"],
    "",
    "## Recent Code Edits",
    ...recentEdits.length > 0 ? recentEdits.map((edit) => {
      const files = edit.files.map((file) => {
        const ranges = file.lineRanges.join(", ");
        const kind = file.contentKind === "non_code_text" ? " text" : file.contentKind === "binary_or_unknown" ? " binary" : "";
        return `${file.relativePath} (${file.status}${kind}${ranges ? ` ${ranges}` : ""})`;
      }).join(", ");
      return `- ${edit.timestamp} | ${files}`;
    }) : ["- none"],
    "",
    "## Recent Transcripts",
    ...[...args.transcripts].sort((left, right) => (right.lastTimestamp ?? "").localeCompare(left.lastTimestamp ?? "")).slice(0, 20).map((transcript) => `- ${transcript.relativePath} | prompts: ${transcript.promptCount} | plans: ${transcript.planCount} | edits: ${transcript.codeEditCount}`),
    "",
    "## Recent Sessions",
    ...args.sessions.slice(0, 20).map((session) => `- ${session.lastTimestamp ?? "unknown"} | ${session.sessionId} | prompts: ${session.promptCount} | plans: ${session.planCount} | edits: ${session.codeEditCount}${session.latestPromptPreview ? ` | ${truncatePreview2(session.latestPromptPreview, 140)}` : ""}`),
    ""
  ];
  return lines.join(`
`) + `
`;
}
function toPythonLiteral(value) {
  if (value === null || value === undefined) {
    return "None";
  }
  if (typeof value === "string") {
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? String(value) : "None";
  }
  if (typeof value === "boolean") {
    return value ? "True" : "False";
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => toPythonLiteral(item)).join(", ")}]`;
  }
  if (typeof value === "object") {
    const entries = Object.entries(value).map(([key, item]) => `${JSON.stringify(key)}: ${toPythonLiteral(item)}`);
    return `{${entries.join(", ")}}`;
  }
  return JSON.stringify(String(value));
}
function toPrettyPythonLiteral(value, indent = 0) {
  const currentIndent = " ".repeat(indent);
  const nestedIndent = " ".repeat(indent + 4);
  if (value === null || value === undefined || typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return toPythonLiteral(value);
  }
  if (Array.isArray(value)) {
    if (value.length === 0) {
      return "[]";
    }
    const lines = value.map((item) => `${nestedIndent}${toPrettyPythonLiteral(item, indent + 4)},`);
    return `[
${lines.join(`
`)}
${currentIndent}]`;
  }
  if (typeof value === "object") {
    const entries = Object.entries(value);
    if (entries.length === 0) {
      return "{}";
    }
    const lines = entries.map(([key, item]) => `${nestedIndent}${JSON.stringify(key)}: ${toPrettyPythonLiteral(item, indent + 4)},`);
    return `{
${lines.join(`
`)}
${currentIndent}}`;
  }
  return toPythonLiteral(String(value));
}
function renderIndexModule(args) {
  const recentTranscripts = [...args.transcripts].sort((left, right) => (right.lastTimestamp ?? "").localeCompare(left.lastTimestamp ?? "")).slice(0, 20).map((transcript) => ({
    relative_path: transcript.relativePath,
    session_id: transcript.sessionId,
    is_sidechain: transcript.isSidechain,
    agent_id: transcript.agentId ?? null,
    prompt_count: transcript.promptCount,
    plan_count: transcript.planCount,
    code_edit_count: transcript.codeEditCount,
    last_timestamp: transcript.lastTimestamp ?? null
  }));
  const recentSessions = args.sessions.slice(0, 20).map((session) => ({
    session_id: session.sessionId,
    transcript_count: session.transcriptCount,
    prompt_count: session.promptCount,
    plan_count: session.planCount,
    code_edit_count: session.codeEditCount,
    first_timestamp: session.firstTimestamp ?? null,
    last_timestamp: session.lastTimestamp ?? null,
    latest_prompt_preview: session.latestPromptPreview ?? null,
    latest_plan_preview: session.latestPlanPreview ?? null,
    top_files: session.topFiles
  }));
  const recentPrompts = sortByTimestamp(args.prompts).slice(-20).reverse().map((prompt) => ({
    event_id: prompt.eventId,
    timestamp: prompt.timestamp,
    transcript: prompt.transcriptRelativePath,
    text: truncatePreview2(getPromptPreview(prompt), 220),
    full_text: prompt.fullText,
    normalized_text: prompt.normalizedText
  }));
  const recentPlans = sortByTimestamp(args.plans).slice(-12).reverse().map((plan) => ({
    event_id: plan.eventId,
    timestamp: plan.timestamp,
    source: plan.source,
    transcript: plan.transcriptRelativePath,
    preview: truncatePreview2(plan.content, 220)
  }));
  const recentCodeEdits = sortByTimestamp(args.codeEdits).slice(-20).reverse().map((edit) => ({
    event_id: edit.eventId,
    timestamp: edit.timestamp,
    transcript: edit.transcriptRelativePath,
    files: edit.files.map((file) => ({
      path: file.relativePath,
      status: file.status,
      content_kind: file.contentKind,
      additions: file.additions,
      deletions: file.deletions,
      line_ranges: file.lineRanges,
      diff_text: file.diffText,
      before_content: file.contentKind === "non_code_text" ? file.beforeContent ?? null : null,
      after_content: file.contentKind === "non_code_text" ? file.afterContent ?? null : null
    }))
  }));
  const hotFiles = args.files.slice(0, 30).map((file) => ({
    path: file.relativePath,
    touch_count: file.touchCount,
    last_edited_at: file.lastEditedAt,
    last_edit_event_id: file.lastEditEventId
  }));
  const memoryObjectCounts = countMemoryObjectsByKind(args.memoryObjects);
  const compareDurableMemoryObjects = (left, right) => right.sessionIds.length - left.sessionIds.length || right.evidence.length - left.evidence.length || right.confidence - left.confidence || right.lastSeenAt.localeCompare(left.lastSeenAt);
  const summarizeMemoryObject = (object) => ({
    object_id: object.objectId,
    kind: object.kind,
    status: object.status,
    statement: object.statement,
    confidence: object.confidence,
    first_seen_at: object.firstSeenAt,
    last_seen_at: object.lastSeenAt,
    session_count: object.sessionIds.length,
    evidence_count: object.evidence.length,
    superseded_by: object.supersededBy ?? null,
    superseded_statement: object.supersededStatement ?? null,
    replacement_statement: object.replacementStatement ?? null,
    tags: object.tags,
    source_event_ids: object.sourceEventIds
  });
  const recentMemoryObjects = args.memoryObjects.slice(0, 24).map(summarizeMemoryObject);
  const activeUserPreferences = args.memoryObjects.filter((object) => object.kind === "user_preference" && object.status === "active").sort(compareDurableMemoryObjects).slice(0, 12).map(summarizeMemoryObject);
  const activeStableConstraints = args.memoryObjects.filter((object) => object.kind === "stable_constraint" && object.status === "active").sort(compareDurableMemoryObjects).slice(0, 12).map(summarizeMemoryObject);
  const recentDecisionRationales = args.memoryObjects.filter((object) => object.kind === "decision_rationale").slice(0, 12).map(summarizeMemoryObject);
  const recentSupersededDecisions = args.memoryObjects.filter((object) => object.kind === "superseded_decision").slice(0, 12).map(summarizeMemoryObject);
  const eventCounts = {
    transcripts: args.manifest.transcriptCount,
    sessions: args.manifest.sessionCount,
    user_prompts: args.manifest.userPromptCount,
    plans: args.manifest.planCount,
    code_edits: args.manifest.codeEditCount,
    memory_objects: args.manifest.memoryObjectCount,
    files_touched: args.manifest.fileCount,
    relations: args.manifest.edgeCount
  };
  return [
    "# __index__.py  (auto-generated memory navigation bus)",
    "from __future__ import annotations",
    "",
    `MEMORY_SOURCE_OF_TRUTH = ${toPythonLiteral({
      events_jsonl: MEMORY_SOURCE_OF_TRUTH_DESCRIPTION,
      source_inputs: MEMORY_SOURCE_INPUTS_DESCRIPTION,
      transcripts_dir: args.manifest.transcriptsDir,
      file_history_dir: args.manifest.fileHistoryDir,
      codex_sessions_dir: args.manifest.codexSessionsDir,
      project_memory_graph_py: "project-level relation map for sessions, plans, edits, durable memory objects, and touched files; concise navigation layer, not source of truth",
      skeleton_index_py: "segment/topic Python skeleton index for targeted recall; open only the modules you need",
      dot_manifest_json: "sharded DOT manifest for overview graphs plus session/topic shards; prefer shards over loading giant DOT files",
      memory_objects_jsonl: "derived semantic layer for user preferences, stable constraints, decision rationales, and superseded decisions; verify exact wording against events.jsonl when needed",
      compact_summaries_not_source_of_truth: [
        ".claude/context/session_state.py",
        ".claude/context/session_history.py",
        ".claude/context/session_metrics.py"
      ],
      summary: "summary and recent_* lists are previews only; use events.jsonl for durable memory"
    })}`,
    `EVENT_COUNTS = ${toPythonLiteral(eventCounts)}`,
    `MEMORY_OBJECT_COUNTS = ${toPythonLiteral(memoryObjectCounts)}`,
    `RECENT_SESSIONS = ${toPythonLiteral(recentSessions)}`,
    `RECENT_TRANSCRIPTS = ${toPythonLiteral(recentTranscripts)}`,
    `RECENT_USER_PROMPTS = ${toPythonLiteral(recentPrompts)}`,
    `RECENT_PLANS = ${toPythonLiteral(recentPlans)}`,
    `RECENT_CODE_EDITS = ${toPythonLiteral(recentCodeEdits)}`,
    `RECENT_MEMORY_OBJECTS = ${toPythonLiteral(recentMemoryObjects)}`,
    `ACTIVE_USER_PREFERENCES = ${toPythonLiteral(activeUserPreferences)}`,
    `ACTIVE_STABLE_CONSTRAINTS = ${toPythonLiteral(activeStableConstraints)}`,
    `RECENT_DECISION_RATIONALES = ${toPythonLiteral(recentDecisionRationales)}`,
    `RECENT_SUPERSEDED_DECISIONS = ${toPythonLiteral(recentSupersededDecisions)}`,
    `HOT_FILES = ${toPythonLiteral(hotFiles)}`,
    "",
    "def recent_sessions(n: int = 10):",
    "    return RECENT_SESSIONS[:n]",
    "",
    "def recent_prompts(n: int = 10):",
    "    return RECENT_USER_PROMPTS[:n]",
    "",
    "def recent_plans(n: int = 10):",
    "    return RECENT_PLANS[:n]",
    "",
    "def recent_code_edits(n: int = 10):",
    "    return RECENT_CODE_EDITS[:n]",
    "",
    'def memory_objects(kind: str = "", n: int = 10):',
    '    if kind == "user_preference":',
    "        return ACTIVE_USER_PREFERENCES[:n]",
    '    if kind == "stable_constraint":',
    "        return ACTIVE_STABLE_CONSTRAINTS[:n]",
    '    if kind == "decision_rationale":',
    "        return RECENT_DECISION_RATIONALES[:n]",
    '    if kind == "superseded_decision":',
    "        return RECENT_SUPERSEDED_DECISIONS[:n]",
    "    return RECENT_MEMORY_OBJECTS[:n]",
    "",
    "def hot_files(n: int = 10):",
    "    return HOT_FILES[:n]",
    ""
  ].join(`
`);
}
function renderProjectMemoryGraphModule(args) {
  const compareDurableMemoryObjects = (left, right) => right.sessionIds.length - left.sessionIds.length || right.evidence.length - left.evidence.length || right.confidence - left.confidence || right.lastSeenAt.localeCompare(left.lastSeenAt);
  const referencedPlanIds = new Set([
    ...args.graphAnalysis.topics.flatMap((topic) => topic.planIds),
    ...args.graphAnalysis.sessions.flatMap((session) => session.planIds),
    ...args.graphAnalysis.files.flatMap((file) => file.planIds)
  ].filter(Boolean));
  const referencedMemoryIds = new Set([
    ...args.graphAnalysis.topics.flatMap((topic) => topic.memoryObjectIds),
    ...args.graphAnalysis.sessions.flatMap((session) => session.memoryObjectIds),
    ...args.graphAnalysis.files.flatMap((file) => file.memoryObjectIds)
  ].filter(Boolean));
  const selectedConstraints = args.memoryObjects.filter((object) => object.kind === "stable_constraint" && object.status === "active" && (referencedMemoryIds.has(object.objectId) || referencedMemoryIds.size === 0)).sort(compareDurableMemoryObjects).slice(0, 16);
  const selectedPreferences = args.memoryObjects.filter((object) => object.kind === "user_preference" && object.status === "active" && (referencedMemoryIds.has(object.objectId) || referencedMemoryIds.size === 0)).sort(compareDurableMemoryObjects).slice(0, 16);
  const selectedRationales = args.memoryObjects.filter((object) => object.kind === "decision_rationale" && (referencedMemoryIds.has(object.objectId) || referencedMemoryIds.size === 0)).sort(compareDurableMemoryObjects).slice(0, 16);
  const selectedSuperseded = args.memoryObjects.filter((object) => object.kind === "superseded_decision" && (referencedMemoryIds.has(object.objectId) || referencedMemoryIds.size === 0)).sort(compareDurableMemoryObjects).slice(0, 10);
  const memorySymbolById = new Map;
  for (const object of [
    ...selectedConstraints,
    ...selectedPreferences,
    ...selectedRationales,
    ...selectedSuperseded
  ]) {
    const prefix = object.kind === "stable_constraint" ? "constraint" : object.kind === "user_preference" ? "preference" : object.kind === "decision_rationale" ? "decision" : "superseded";
    memorySymbolById.set(object.objectId, `${prefix}_${object.objectId.split(":").at(-1)}`);
  }
  const selectedPlans = dedupeByKey2([
    ...args.plans.filter((plan) => referencedPlanIds.has(plan.eventId)).slice().reverse(),
    ...args.plans.slice().reverse()
  ], (plan) => plan.eventId).slice(0, Math.max(12, referencedPlanIds.size));
  const planSymbolById = new Map(selectedPlans.map((plan, index) => [
    plan.eventId,
    `plan_${String(index + 1).padStart(2, "0")}_${hashContent2(plan.eventId).slice(0, 6)}`
  ]));
  const topicSymbolById = new Map(args.graphAnalysis.topics.map((topic) => [
    topic.topicId,
    toPythonSymbol(topic.title, "topic")
  ]));
  const sessionSymbolById = new Map(args.graphAnalysis.sessions.map((session) => [
    session.sessionId,
    `session_${session.sessionId.slice(0, 8)}`
  ]));
  const fileSymbolByPath = new Map(args.graphAnalysis.files.map((file) => [file.path, toPythonSymbol(file.path, "file")]));
  const memoryRef = (objectId) => {
    const object = args.memoryObjects.find((candidate) => candidate.objectId === objectId);
    const symbol = memorySymbolById.get(objectId);
    if (!object || !symbol) {
      return objectId;
    }
    const className = object.kind === "stable_constraint" ? "Constraints" : object.kind === "user_preference" ? "Preferences" : "Decisions";
    return `${className}.${symbol}`;
  };
  const selectedPlanPreview = (plan) => truncatePreview2(plan.content.replace(/^#+\s*/gm, "").replace(/\s+/g, " ").trim(), 180);
  const resolveGraphNodeRef = (nodeId) => {
    if (nodeId.startsWith("topic:")) {
      const topicId = nodeId.slice("topic:".length);
      return topicSymbolById.get(topicId) ?? topicId;
    }
    if (nodeId.startsWith("session:")) {
      const sessionId = nodeId.slice("session:".length);
      return sessionSymbolById.get(sessionId) ?? sessionId;
    }
    if (nodeId.startsWith("file:")) {
      const filePath = nodeId.slice("file:".length);
      return fileSymbolByPath.get(filePath) ?? filePath;
    }
    if (nodeId.startsWith("plan:")) {
      const planId = nodeId.slice("plan:".length);
      return planSymbolById.get(planId) ?? planId;
    }
    if (nodeId.startsWith("memory:")) {
      return memoryRef(nodeId.slice("memory:".length));
    }
    return nodeId;
  };
  const formatRecentRanges = (ranges) => truncatePreview2(ranges.map((range) => {
    const sessionLabel = sessionSymbolById.get(range.sessionId) ?? range.sessionId;
    const statusLabel = range.status ? ` ${range.status}` : "";
    return `${sessionLabel}${statusLabel} ${range.lineRanges}`.trim();
  }).join(" | "), 220);
  const lines = [
    "# project_memory_graph.py  (auto-generated project memory skeleton)",
    "from __future__ import annotations",
    "",
    "# Read order: Topics -> Sessions -> Files -> Constraints -> Preferences -> Decisions -> Plans",
    "# Durable source of truth: .memory_index/index/events.jsonl",
    "# Semantic layer: .memory_index/index/memory_objects.jsonl",
    "# Graph view: .memory_index/index/memory_graph.dot",
    "",
    `PROJECT_MEMORY_META = ${toPrettyPythonLiteral({
      artifact_version: args.manifest.artifactVersion,
      graph_source: args.graphAnalysis.source,
      graph_topics: args.graphAnalysis.topics.length,
      graph_sessions: args.graphAnalysis.sessions.length,
      graph_files: args.graphAnalysis.files.length,
      graph_segments: args.graphAnalysis.segments.length,
      graph_edges: args.graphAnalysis.edges.length,
      root_dir: args.manifest.rootDir,
      output_dir: args.manifest.outputDir,
      transcripts_dir: args.manifest.transcriptsDir,
      file_history_dir: args.manifest.fileHistoryDir,
      codex_sessions_dir: args.manifest.codexSessionsDir,
      source_of_truth: "index/events.jsonl",
      graph_json: "index/memory_graph.json",
      graph_dot: "index/memory_graph.dot",
      skeleton_index: "skeleton/__index__.py",
      dot_manifest: "index/dot/manifest.json",
      counts: {
        sessions: args.manifest.sessionCount,
        transcripts: args.manifest.transcriptCount,
        prompts: args.manifest.userPromptCount,
        plans: args.manifest.planCount,
        code_edits: args.manifest.codeEditCount,
        memory_objects: args.manifest.memoryObjectCount,
        files_touched: args.manifest.fileCount
      }
    })}`,
    "",
    "def topic_ref(name: str) -> None: ...",
    "def session_ref(name: str) -> None: ...",
    "def file_ref(name: str) -> None: ...",
    "def segment_ref(name: str) -> None: ...",
    "def plan_ref(name: str) -> None: ...",
    "def memory_ref(name: str) -> None: ...",
    'def rel(kind: str, target: str, reason: str = "") -> None: ...',
    "",
    "class Constraints:"
  ];
  if (selectedConstraints.length === 0) {
    lines.push("    ...");
  } else {
    for (const object of selectedConstraints) {
      const symbol = memorySymbolById.get(object.objectId) ?? `constraint_${hashContent2(object.objectId).slice(0, 10)}`;
      lines.push(`    # @memory ${object.objectId} | last_seen ${object.lastSeenAt} | sessions ${object.sessionIds.length}`);
      lines.push(`    ${symbol} = ${JSON.stringify(object.statement)}`);
      lines.push("");
    }
    if (lines.at(-1) === "") {
      lines.pop();
    }
  }
  lines.push("", "class Preferences:");
  if (selectedPreferences.length === 0) {
    lines.push("    ...");
  } else {
    for (const object of selectedPreferences) {
      const symbol = memorySymbolById.get(object.objectId) ?? `preference_${hashContent2(object.objectId).slice(0, 10)}`;
      lines.push(`    # @memory ${object.objectId} | last_seen ${object.lastSeenAt} | sessions ${object.sessionIds.length}`);
      lines.push(`    ${symbol} = ${JSON.stringify(object.statement)}`);
      lines.push("");
    }
    if (lines.at(-1) === "") {
      lines.pop();
    }
  }
  lines.push("", "class Decisions:");
  if (selectedRationales.length === 0 && selectedSuperseded.length === 0) {
    lines.push("    ...");
  } else {
    for (const object of selectedRationales) {
      const symbol = memorySymbolById.get(object.objectId) ?? `decision_${hashContent2(object.objectId).slice(0, 10)}`;
      lines.push(`    # @memory ${object.objectId} | rationale | last_seen ${object.lastSeenAt}`);
      lines.push(`    ${symbol} = ${JSON.stringify(object.statement)}`);
      lines.push("");
    }
    for (const object of selectedSuperseded) {
      const symbol = memorySymbolById.get(object.objectId) ?? `superseded_${hashContent2(object.objectId).slice(0, 10)}`;
      const change = object.supersededStatement && object.replacementStatement ? `${object.supersededStatement} -> ${object.replacementStatement}` : object.statement;
      lines.push(`    # @memory ${object.objectId} | superseded | last_seen ${object.lastSeenAt}`);
      lines.push(`    ${symbol} = ${JSON.stringify(change)}`);
      lines.push("");
    }
    if (lines.at(-1) === "") {
      lines.pop();
    }
  }
  lines.push("", "class Plans:", "    ...", "");
  for (const plan of selectedPlans) {
    const symbol = planSymbolById.get(plan.eventId) ?? `plan_${hashContent2(plan.eventId).slice(0, 10)}`;
    lines.push(`# @plan ${plan.eventId} | ${plan.timestamp} | ${plan.source} | session ${plan.sessionId}`);
    lines.push(`def ${symbol}() -> None:`);
    lines.push(`    """${selectedPlanPreview(plan)}"""`);
    lines.push(`    # transcript: ${plan.transcriptRelativePath}`);
    if (plan.planFilePath) {
      lines.push(`    # plan_file: ${plan.planFilePath}`);
    }
    lines.push("    ...");
    lines.push("");
  }
  lines.push("class Topics:", "    ...", "");
  for (const topic of args.graphAnalysis.topics) {
    const symbol = topicSymbolById.get(topic.topicId) ?? toPythonSymbol(topic.title, "topic");
    lines.push(`# @topic ${topic.topicId} | status ${topic.status} | sessions ${topic.sessionIds.length} | files ${topic.filePaths.length}`);
    lines.push(`def ${symbol}() -> None:`);
    lines.push(`    """${topic.summary}"""`);
    lines.push(`    # title: ${topic.title}`);
    for (const sessionId of topic.sessionIds) {
      lines.push(`    session_ref(${JSON.stringify(sessionSymbolById.get(sessionId) ?? sessionId)})`);
    }
    for (const filePath of topic.filePaths) {
      lines.push(`    file_ref(${JSON.stringify(fileSymbolByPath.get(filePath) ?? filePath)})`);
    }
    for (const planId of topic.planIds) {
      lines.push(`    plan_ref(${JSON.stringify(planSymbolById.get(planId) ?? planId)})`);
    }
    for (const memoryObjectId of topic.memoryObjectIds) {
      lines.push(`    memory_ref(${JSON.stringify(memoryRef(memoryObjectId))})`);
    }
    for (const relatedTopic of topic.relatedTopics) {
      lines.push(`    rel("related_topic", ${JSON.stringify(topicSymbolById.get(relatedTopic.topicId) ?? relatedTopic.topicId)}, ${JSON.stringify(relatedTopic.reason)})`);
    }
    for (const edge of args.graphAnalysis.edges.filter((edge2) => edge2.source === `topic:${topic.topicId}`)) {
      lines.push(`    rel(${JSON.stringify(edge.kind)}, ${JSON.stringify(resolveGraphNodeRef(edge.target))}, ${JSON.stringify(edge.reason)})`);
    }
    lines.push("    ...");
    lines.push("");
  }
  lines.push("class Sessions:", "    ...", "");
  for (const session of args.graphAnalysis.sessions) {
    const symbol = sessionSymbolById.get(session.sessionId) ?? `session_${session.sessionId.slice(0, 8)}`;
    lines.push(`# @session ${session.sessionId} | topics ${session.topicIds.length} | files ${session.filePaths.length}`);
    lines.push(`def ${symbol}() -> None:`);
    lines.push(`    """${session.title}"""`);
    lines.push(`    # summary: ${session.summary}`);
    for (const topicId of session.topicIds) {
      lines.push(`    topic_ref(${JSON.stringify(topicSymbolById.get(topicId) ?? topicId)})`);
    }
    for (const filePath of session.filePaths) {
      lines.push(`    file_ref(${JSON.stringify(fileSymbolByPath.get(filePath) ?? filePath)})`);
    }
    for (const planId of session.planIds) {
      lines.push(`    plan_ref(${JSON.stringify(planSymbolById.get(planId) ?? planId)})`);
    }
    for (const memoryObjectId of session.memoryObjectIds) {
      lines.push(`    memory_ref(${JSON.stringify(memoryRef(memoryObjectId))})`);
    }
    for (const relatedSession of session.relatedSessions) {
      lines.push(`    rel("related_session", ${JSON.stringify(sessionSymbolById.get(relatedSession.sessionId) ?? relatedSession.sessionId)}, ${JSON.stringify(relatedSession.reason)})`);
    }
    for (const edge of args.graphAnalysis.edges.filter((edge2) => edge2.source === `session:${session.sessionId}`)) {
      lines.push(`    rel(${JSON.stringify(edge.kind)}, ${JSON.stringify(resolveGraphNodeRef(edge.target))}, ${JSON.stringify(edge.reason)})`);
    }
    lines.push("    ...");
    lines.push("");
  }
  lines.push("class Files:", "    ...", "");
  for (const file of args.graphAnalysis.files) {
    const symbol = fileSymbolByPath.get(file.path) ?? toPythonSymbol(file.path, "file");
    lines.push(`# @file ${file.path} | topics ${file.topicIds.length} | sessions ${file.sessionIds.length}`);
    lines.push(`def ${symbol}() -> None:`);
    lines.push(`    """${file.role}"""`);
    if (file.recentRanges.length > 0) {
      lines.push(`    # recent_ranges: ${formatRecentRanges(file.recentRanges)}`);
    }
    for (const topicId of file.topicIds) {
      lines.push(`    topic_ref(${JSON.stringify(topicSymbolById.get(topicId) ?? topicId)})`);
    }
    for (const sessionId of file.sessionIds) {
      lines.push(`    session_ref(${JSON.stringify(sessionSymbolById.get(sessionId) ?? sessionId)})`);
    }
    for (const planId of file.planIds) {
      lines.push(`    plan_ref(${JSON.stringify(planSymbolById.get(planId) ?? planId)})`);
    }
    for (const memoryObjectId of file.memoryObjectIds) {
      lines.push(`    memory_ref(${JSON.stringify(memoryRef(memoryObjectId))})`);
    }
    for (const edge of args.graphAnalysis.edges.filter((edge2) => edge2.source === `file:${file.path}`)) {
      lines.push(`    rel(${JSON.stringify(edge.kind)}, ${JSON.stringify(resolveGraphNodeRef(edge.target))}, ${JSON.stringify(edge.reason)})`);
    }
    lines.push("    ...");
    lines.push("");
  }
  lines.push("def active_constraints() -> list[str]:", `    return [${selectedConstraints.map((object) => JSON.stringify(object.statement)).join(", ")}]`, "", "def active_preferences() -> list[str]:", `    return [${selectedPreferences.map((object) => JSON.stringify(object.statement)).join(", ")}]`, "");
  return lines.join(`
`);
}
function toArtifactFileStem(value, prefix) {
  const symbol = toPythonSymbol(value, prefix);
  const normalized = symbol.startsWith(`${prefix}_`) ? symbol.slice(prefix.length + 1) : symbol;
  const core = normalized || hashContent2(value).slice(0, 8);
  return `${prefix}_${core.slice(0, 24)}_${hashContent2(value).slice(0, 8)}`;
}
function renderMemorySkeletonPackageInit() {
  return ["from __future__ import annotations", ""].join(`
`);
}
function renderMemorySkeletonRefsModule() {
  return [
    "from __future__ import annotations",
    "",
    "def topic_ref(name: str) -> None: ...",
    "def session_ref(name: str) -> None: ...",
    "def file_ref(name: str) -> None: ...",
    "def segment_ref(name: str) -> None: ...",
    "def plan_ref(name: str) -> None: ...",
    "def memory_ref(name: str) -> None: ...",
    'def rel(kind: str, target: str, reason: str = "") -> None: ...',
    ""
  ].join(`
`);
}
function renderMemorySkeletonIndexModule(args) {
  return [
    "from __future__ import annotations",
    "",
    `SKELETON_META = ${toPrettyPythonLiteral({
      topics: args.graphAnalysis.topics.length,
      sessions: args.graphAnalysis.sessions.length,
      files: args.graphAnalysis.files.length,
      segments: args.graphAnalysis.segments.length,
      dot_manifest: "../index/dot/manifest.json",
      source_of_truth: "../index/events.jsonl"
    })}`,
    `TOPIC_MODULES = ${toPrettyPythonLiteral(Object.fromEntries(args.graphAnalysis.topics.map((topic) => [
      topic.topicId,
      args.topicModulePaths.get(topic.topicId) ?? ""
    ])))}`,
    `SEGMENT_MODULES = ${toPrettyPythonLiteral(Object.fromEntries(args.graphAnalysis.segments.map((segment) => [
      segment.segmentId,
      args.segmentModulePaths.get(segment.segmentId) ?? ""
    ])))}`,
    "",
    "def topic_module(topic_id: str) -> str:",
    '    return TOPIC_MODULES.get(topic_id, "")',
    "",
    "def segment_module(segment_id: str) -> str:",
    '    return SEGMENT_MODULES.get(segment_id, "")',
    ""
  ].join(`
`);
}
function renderTopicSkeletonModule(args) {
  const segments = args.analysis.segments.filter((segment) => segment.topicIds.includes(args.topic.topicId)).slice(0, 12);
  const functionName = toPythonSymbol(args.topic.title, "topic");
  const lines = [
    "from __future__ import annotations",
    "",
    "from ..refs import file_ref, memory_ref, plan_ref, rel, segment_ref, session_ref, topic_ref",
    "",
    `TOPIC = ${toPrettyPythonLiteral({
      topic_id: args.topic.topicId,
      title: args.topic.title,
      summary: args.topic.summary,
      status: args.topic.status,
      segments: segments.map((segment) => segment.segmentId)
    })}`,
    "",
    `# @topic ${args.topic.topicId}`,
    `def ${functionName}() -> None:`,
    `    """${args.topic.summary}"""`
  ];
  for (const sessionId of args.topic.sessionIds) {
    lines.push(`    session_ref(${JSON.stringify(sessionId)})`);
  }
  for (const segment of segments) {
    lines.push(`    segment_ref(${JSON.stringify(segment.segmentId)})`);
  }
  for (const filePath of args.topic.filePaths) {
    lines.push(`    file_ref(${JSON.stringify(filePath)})`);
  }
  for (const planId of args.topic.planIds) {
    lines.push(`    plan_ref(${JSON.stringify(planId)})`);
  }
  for (const memoryObjectId of args.topic.memoryObjectIds) {
    lines.push(`    memory_ref(${JSON.stringify(memoryObjectId)})`);
  }
  for (const relatedTopic of args.topic.relatedTopics) {
    lines.push(`    topic_ref(${JSON.stringify(relatedTopic.topicId)})`, `    rel("related_topic", ${JSON.stringify(`topic:${relatedTopic.topicId}`)}, ${JSON.stringify(relatedTopic.reason)})`);
  }
  lines.push("    ...", "");
  return lines.join(`
`);
}
function renderSegmentSkeletonModule(args) {
  const functionName = toPythonSymbol(`${args.segment.kind}_${args.segment.title}`, "segment");
  const lines = [
    "from __future__ import annotations",
    "",
    "from ..refs import file_ref, memory_ref, plan_ref, rel, segment_ref, session_ref, topic_ref",
    "",
    `SEGMENT = ${toPrettyPythonLiteral({
      segment_id: args.segment.segmentId,
      kind: args.segment.kind,
      session_id: args.segment.sessionId,
      title: args.segment.title,
      summary: args.segment.summary,
      source_event_ids: args.segment.sourceEventIds
    })}`,
    "",
    `# @segment ${args.segment.segmentId}`,
    `def ${functionName}() -> None:`,
    `    """${args.segment.summary}"""`,
    `    session_ref(${JSON.stringify(args.segment.sessionId)})`
  ];
  if (args.segment.recentRanges.length > 0) {
    lines.push(`    # recent_ranges: ${truncatePreview2(args.segment.recentRanges.map((range) => `${range.path} ${range.status}${range.lineRanges ? ` ${range.lineRanges}` : ""}`).join(" | "), 220)}`);
  }
  for (const topicId of args.segment.topicIds) {
    lines.push(`    topic_ref(${JSON.stringify(topicId)})`);
  }
  for (const filePath of args.segment.filePaths) {
    lines.push(`    file_ref(${JSON.stringify(filePath)})`);
  }
  for (const planId of args.segment.planIds) {
    lines.push(`    plan_ref(${JSON.stringify(planId)})`);
  }
  for (const memoryObjectId of args.segment.memoryObjectIds) {
    lines.push(`    memory_ref(${JSON.stringify(memoryObjectId)})`);
  }
  for (const relatedSegment of args.segment.relatedSegments) {
    lines.push(`    segment_ref(${JSON.stringify(relatedSegment.segmentId)})`, `    rel("related_segment", ${JSON.stringify(`segment:${relatedSegment.segmentId}`)}, ${JSON.stringify(relatedSegment.reason)})`);
  }
  lines.push("    ...", "");
  return lines.join(`
`);
}
async function writeMemorySkeletonArtifacts(args) {
  const skeletonDir = join6(args.outputDir, "skeleton");
  const topicsDir = join6(skeletonDir, "topics");
  const segmentsDir = join6(skeletonDir, "segments");
  await mkdir2(topicsDir, { recursive: true });
  await mkdir2(segmentsDir, { recursive: true });
  const topicModulePaths = new Map;
  const segmentModulePaths = new Map;
  for (const topic of args.graphAnalysis.topics) {
    const relativeModulePath = toPosixPath2(join6("topics", `${toArtifactFileStem(topic.topicId, "topic")}.py`));
    topicModulePaths.set(topic.topicId, relativeModulePath);
    await writeFile2(join6(skeletonDir, relativeModulePath), renderTopicSkeletonModule({
      topic,
      analysis: args.graphAnalysis
    }), "utf8");
  }
  for (const segment of args.graphAnalysis.segments) {
    const relativeModulePath = toPosixPath2(join6("segments", `${toArtifactFileStem(segment.segmentId, "segment")}.py`));
    segmentModulePaths.set(segment.segmentId, relativeModulePath);
    await writeFile2(join6(skeletonDir, relativeModulePath), renderSegmentSkeletonModule({
      segment
    }), "utf8");
  }
  await writeFile2(join6(skeletonDir, "__init__.py"), renderMemorySkeletonPackageInit(), "utf8");
  await writeFile2(join6(topicsDir, "__init__.py"), renderMemorySkeletonPackageInit(), "utf8");
  await writeFile2(join6(segmentsDir, "__init__.py"), renderMemorySkeletonPackageInit(), "utf8");
  await writeFile2(join6(skeletonDir, "refs.py"), renderMemorySkeletonRefsModule(), "utf8");
  await writeFile2(join6(skeletonDir, "__index__.py"), renderMemorySkeletonIndexModule({
    graphAnalysis: args.graphAnalysis,
    topicModulePaths,
    segmentModulePaths
  }), "utf8");
}
function dotArtifactId(value) {
  return value.replace(/[^a-zA-Z0-9_]/g, "_");
}
function dotArtifactLabel(value) {
  return value.replace(/"/g, "\\\"");
}
function renderFocusedMemoryDot(args) {
  const lines = [
    `digraph ${args.name} {`,
    "  rankdir=LR;",
    '  graph [fontname="Helvetica"];',
    '  node [fontname="Helvetica", style="filled,rounded"];',
    '  edge [fontname="Helvetica"];',
    ""
  ];
  for (const node of args.nodes) {
    lines.push(`  ${dotArtifactId(node.id)} [shape=${node.shape}, fillcolor="${node.fillColor}", label="${dotArtifactLabel(node.label)}"];`);
  }
  lines.push("");
  for (const edge of args.edges) {
    lines.push(`  ${dotArtifactId(edge.source)} -> ${dotArtifactId(edge.target)} [label="${dotArtifactLabel(edge.kind)}"];`);
  }
  lines.push("}");
  return `${lines.join(`
`)}
`;
}
function renderTopicShardDot(args) {
  const topic = args.analysis.topics.find((candidate) => candidate.topicId === args.topicId);
  if (!topic) {
    return renderFocusedMemoryDot({
      name: "memory_topic_empty",
      nodes: [],
      edges: []
    });
  }
  const segments = args.analysis.segments.filter((segment) => segment.topicIds.includes(topic.topicId));
  const sessions = args.analysis.sessions.filter((session) => session.topicIds.includes(topic.topicId) || topic.sessionIds.includes(session.sessionId));
  const nodeIds = new Set([
    `topic:${topic.topicId}`,
    ...topic.relatedTopics.map((related) => `topic:${related.topicId}`),
    ...sessions.map((session) => `session:${session.sessionId}`),
    ...segments.map((segment) => `segment:${segment.segmentId}`),
    ...dedupeByKey2([
      ...topic.filePaths,
      ...segments.flatMap((segment) => segment.filePaths)
    ], (value) => value).map((path) => `file:${path}`),
    ...dedupeByKey2([
      ...topic.planIds,
      ...segments.flatMap((segment) => segment.planIds)
    ], (value) => value).map((planId) => `plan:${planId}`),
    ...dedupeByKey2([
      ...topic.memoryObjectIds,
      ...segments.flatMap((segment) => segment.memoryObjectIds)
    ], (value) => value).map((memoryId) => `memory:${memoryId}`)
  ]);
  const nodes = [
    {
      id: `topic:${topic.topicId}`,
      label: topic.title,
      shape: "ellipse",
      fillColor: "#f3f0d7"
    },
    ...topic.relatedTopics.map((related) => ({
      id: `topic:${related.topicId}`,
      label: args.analysis.topics.find((candidate) => candidate.topicId === related.topicId)?.title ?? related.topicId,
      shape: "ellipse",
      fillColor: "#f9f6e5"
    })),
    ...sessions.map((session) => ({
      id: `session:${session.sessionId}`,
      label: session.title,
      shape: "box",
      fillColor: "#d9eef7"
    })),
    ...segments.map((segment) => ({
      id: `segment:${segment.segmentId}`,
      label: `${segment.kind}
${truncatePreview2(segment.title, 72)}`,
      shape: "note",
      fillColor: "#f9e0c7"
    })),
    ...dedupeByKey2([
      ...topic.filePaths,
      ...segments.flatMap((segment) => segment.filePaths)
    ].map((path) => ({
      id: `file:${path}`,
      label: path,
      shape: "box",
      fillColor: "#ececec"
    })), (node) => node.id),
    ...dedupeByKey2([
      ...topic.planIds,
      ...segments.flatMap((segment) => segment.planIds)
    ].map((planId) => ({
      id: `plan:${planId}`,
      label: args.planPreviewById.get(planId) ?? planId,
      shape: "component",
      fillColor: "#d8f0d0"
    })), (node) => node.id),
    ...dedupeByKey2([
      ...topic.memoryObjectIds,
      ...segments.flatMap((segment) => segment.memoryObjectIds)
    ].map((memoryId) => ({
      id: `memory:${memoryId}`,
      label: args.memoryStatementById.get(memoryId) ?? memoryId,
      shape: "hexagon",
      fillColor: "#f3d7e8"
    })), (node) => node.id)
  ];
  return renderFocusedMemoryDot({
    name: "memory_topic_shard",
    nodes: dedupeByKey2(nodes, (node) => node.id),
    edges: args.analysis.edges.filter((edge) => nodeIds.has(edge.source) && nodeIds.has(edge.target))
  });
}
function renderSessionShardDot(args) {
  const session = args.analysis.sessions.find((candidate) => candidate.sessionId === args.sessionId);
  if (!session) {
    if (!args.sessionSummary) {
      return renderFocusedMemoryDot({
        name: "memory_session_empty",
        nodes: [],
        edges: []
      });
    }
    const nodes2 = [
      {
        id: `session:${args.sessionSummary.sessionId}`,
        label: args.sessionSummary.latestPromptPreview ?? args.sessionSummary.latestPlanPreview ?? args.sessionSummary.sessionId,
        shape: "box",
        fillColor: "#d9eef7"
      },
      ...args.sessionSummary.topFiles.slice(0, SESSION_DOT_FILE_LIMIT).map((file) => {
        nodeIds.add(`file:${file.path}`);
        return {
          id: `file:${file.path}`,
          label: file.path,
          shape: "box",
          fillColor: "#ececec"
        };
      })
    ];
    return renderFocusedMemoryDot({
      name: "memory_session_shard",
      nodes: nodes2,
      edges: args.sessionSummary.topFiles.slice(0, SESSION_DOT_FILE_LIMIT).map((file) => ({
        source: `session:${args.sessionSummary.sessionId}`,
        target: `file:${file.path}`,
        kind: "touches",
        reason: `touches ${file.touches}`
      }))
    });
  }
  const segments = args.analysis.segments.filter((segment) => segment.sessionId === session.sessionId);
  const nodeIds = new Set([
    `session:${session.sessionId}`,
    ...session.relatedSessions.map((related) => `session:${related.sessionId}`),
    ...session.topicIds.map((topicId) => `topic:${topicId}`),
    ...segments.map((segment) => `segment:${segment.segmentId}`),
    ...dedupeByKey2([
      ...session.filePaths,
      ...segments.flatMap((segment) => segment.filePaths)
    ], (value) => value).map((path) => `file:${path}`),
    ...dedupeByKey2([
      ...session.planIds,
      ...segments.flatMap((segment) => segment.planIds)
    ], (value) => value).map((planId) => `plan:${planId}`),
    ...dedupeByKey2([
      ...session.memoryObjectIds,
      ...segments.flatMap((segment) => segment.memoryObjectIds)
    ], (value) => value).map((memoryId) => `memory:${memoryId}`)
  ]);
  const nodes = [
    {
      id: `session:${session.sessionId}`,
      label: session.title,
      shape: "box",
      fillColor: "#d9eef7"
    },
    ...session.relatedSessions.map((related) => ({
      id: `session:${related.sessionId}`,
      label: args.analysis.sessions.find((candidate) => candidate.sessionId === related.sessionId)?.title ?? related.sessionId,
      shape: "box",
      fillColor: "#e8f5fa"
    })),
    ...session.topicIds.map((topicId) => ({
      id: `topic:${topicId}`,
      label: args.analysis.topics.find((candidate) => candidate.topicId === topicId)?.title ?? topicId,
      shape: "ellipse",
      fillColor: "#f3f0d7"
    })),
    ...segments.map((segment) => ({
      id: `segment:${segment.segmentId}`,
      label: `${segment.kind}
${truncatePreview2(segment.title, 72)}`,
      shape: "note",
      fillColor: "#f9e0c7"
    })),
    ...dedupeByKey2([
      ...session.filePaths,
      ...segments.flatMap((segment) => segment.filePaths)
    ].map((path) => ({
      id: `file:${path}`,
      label: path,
      shape: "box",
      fillColor: "#ececec"
    })), (node) => node.id),
    ...dedupeByKey2([
      ...session.planIds,
      ...segments.flatMap((segment) => segment.planIds)
    ].map((planId) => ({
      id: `plan:${planId}`,
      label: args.planPreviewById.get(planId) ?? planId,
      shape: "component",
      fillColor: "#d8f0d0"
    })), (node) => node.id),
    ...dedupeByKey2([
      ...session.memoryObjectIds,
      ...segments.flatMap((segment) => segment.memoryObjectIds)
    ].map((memoryId) => ({
      id: `memory:${memoryId}`,
      label: args.memoryStatementById.get(memoryId) ?? memoryId,
      shape: "hexagon",
      fillColor: "#f3d7e8"
    })), (node) => node.id)
  ];
  return renderFocusedMemoryDot({
    name: "memory_session_shard",
    nodes: dedupeByKey2(nodes, (node) => node.id),
    edges: args.analysis.edges.filter((edge) => nodeIds.has(edge.source) && nodeIds.has(edge.target))
  });
}
async function writeMemoryDotArtifacts(args) {
  const dotRootDir = join6(args.outputDir, "index", "dot");
  const sessionsDir = join6(dotRootDir, "sessions");
  const topicsDir = join6(dotRootDir, "topics");
  await mkdir2(sessionsDir, { recursive: true });
  await mkdir2(topicsDir, { recursive: true });
  const planPreviewById = new Map(args.plans.map((plan) => [plan.eventId, truncatePreview2(plan.content, 96)]));
  const memoryStatementById = new Map(args.memoryObjects.map((memoryObject) => [
    memoryObject.objectId,
    truncatePreview2(memoryObject.statement, 96)
  ]));
  const manifest = {
    overview: {
      architecture: "index/architecture.dot",
      sessions: "index/sessions.dot",
      memory_graph: "index/memory_graph.dot"
    },
    shards: {
      sessions: [],
      topics: []
    }
  };
  for (const sessionSummary of args.sessions) {
    const graphSession = args.graphAnalysis.sessions.find((candidate) => candidate.sessionId === sessionSummary.sessionId);
    const relativePath = toPosixPath2(join6("index", "dot", "sessions", `${toArtifactFileStem(sessionSummary.sessionId, "session")}.dot`));
    manifest.shards.sessions.push({
      sessionId: sessionSummary.sessionId,
      title: graphSession?.title ?? sessionSummary.latestPromptPreview ?? sessionSummary.latestPlanPreview ?? sessionSummary.sessionId,
      path: relativePath
    });
    await writeFile2(join6(args.outputDir, relativePath), renderSessionShardDot({
      analysis: args.graphAnalysis,
      sessionId: sessionSummary.sessionId,
      sessionSummary,
      planPreviewById,
      memoryStatementById
    }), "utf8");
  }
  for (const topic of args.graphAnalysis.topics) {
    const relativePath = toPosixPath2(join6("index", "dot", "topics", `${toArtifactFileStem(topic.topicId, "topic")}.dot`));
    manifest.shards.topics.push({
      topicId: topic.topicId,
      title: topic.title,
      path: relativePath
    });
    await writeFile2(join6(args.outputDir, relativePath), renderTopicShardDot({
      analysis: args.graphAnalysis,
      topicId: topic.topicId,
      planPreviewById,
      memoryStatementById
    }), "utf8");
  }
  await writeFile2(join6(dotRootDir, "manifest.json"), JSON.stringify(manifest, null, 2) + `
`, "utf8");
}
async function writeJsonl(path, rows) {
  const content = rows.map((row) => JSON.stringify(row)).join(`
`) + (rows.length > 0 ? `
` : "");
  await writeFile2(path, content, "utf8");
}
async function writeMemoryIndexFiles(args) {
  const indexDir = join6(args.outputDir, "index");
  await writeFile2(join6(indexDir, "manifest.json"), JSON.stringify(args.manifest, null, 2) + `
`, "utf8");
  await writeFile2(join6(indexDir, "summary.md"), renderSummary({
    manifest: args.manifest,
    sessions: args.sessions,
    transcripts: args.transcripts,
    prompts: args.prompts,
    plans: args.plans,
    codeEdits: args.codeEdits,
    memoryObjects: args.memoryObjects,
    files: args.files
  }), "utf8");
  await writeFile2(join6(indexDir, "architecture.dot"), renderDotGraph({
    transcripts: args.transcripts,
    prompts: args.prompts,
    plans: args.plans,
    codeEdits: args.codeEdits,
    files: args.files,
    edges: args.edges
  }), "utf8");
  await writeFile2(join6(indexDir, "sessions.dot"), renderSessionsDot({
    sessions: args.sessions
  }), "utf8");
  await writeFile2(join6(indexDir, "memory_graph.dot"), renderMemoryGraphDot(args.graphAnalysis), "utf8");
  await writeFile2(join6(indexDir, "memory_graph.json"), JSON.stringify(args.graphAnalysis, null, 2) + `
`, "utf8");
  await writeMemoryDotArtifacts({
    outputDir: args.outputDir,
    graphAnalysis: args.graphAnalysis,
    sessions: args.sessions,
    plans: args.plans,
    memoryObjects: args.memoryObjects
  });
  await writeFile2(join6(args.outputDir, "project_memory_graph.py"), renderProjectMemoryGraphModule({
    manifest: args.manifest,
    plans: args.plans,
    memoryObjects: args.memoryObjects,
    graphAnalysis: args.graphAnalysis
  }), "utf8");
  await writeFile2(join6(args.outputDir, "__index__.py"), renderIndexModule({
    manifest: args.manifest,
    sessions: args.sessions,
    transcripts: args.transcripts,
    prompts: args.prompts,
    plans: args.plans,
    codeEdits: args.codeEdits,
    memoryObjects: args.memoryObjects,
    files: args.files
  }), "utf8");
  await writeMemorySkeletonArtifacts({
    outputDir: args.outputDir,
    graphAnalysis: args.graphAnalysis
  });
  await writeJsonl(join6(indexDir, "sessions.jsonl"), args.sessions);
  await writeJsonl(join6(indexDir, "transcripts.jsonl"), args.transcripts);
  await writeJsonl(join6(indexDir, "events.jsonl"), sortByTimestamp([...args.prompts, ...args.plans, ...args.codeEdits]));
  await writeJsonl(join6(indexDir, "memory_objects.jsonl"), args.memoryObjects);
  await writeJsonl(join6(indexDir, "edges.jsonl"), args.edges);
  await writeJsonl(join6(indexDir, "files.jsonl"), args.files);
}
async function buildMemoryIndex(options) {
  const startedAt = Date.now();
  const rootDir = resolve2(options.rootDir);
  const outputDir = options.outputDir ? resolve2(options.outputDir) : resolve2(rootDir, ".memory_index");
  const transcriptsDir = options.transcriptsDir ? resolve2(options.transcriptsDir) : getProjectConversationTranscriptsDir(rootDir);
  const fileHistoryDir = options.fileHistoryDir ? resolve2(options.fileHistoryDir) : getProjectConversationFileHistoryDir(rootDir);
  const codexSessionsDir = options.codexSessionsDir ? resolve2(options.codexSessionsDir) : getCodexSessionsDir();
  await ensureOutputDirectories(outputDir);
  await mkdir2(transcriptsDir, { recursive: true });
  await mkdir2(fileHistoryDir, { recursive: true });
  const legacyHydration = options.includeLegacyClaude ? await hydrateProjectConversationContextFromLegacyClaude({
    rootDir,
    transcriptsDir,
    fileHistoryDir,
    onProgress: options.onProgress
  }) : {
    copiedTranscriptCount: 0,
    copiedBackupCount: 0,
    legacyProjectDir: getProjectDir(rootDir)
  };
  await reportProgress(options.onProgress, {
    phase: "discover",
    message: options.includeLegacyClaude && (legacyHydration.copiedTranscriptCount > 0 || legacyHydration.copiedBackupCount > 0) ? `Scanning transcript files after optional legacy Claude hydration (${legacyHydration.copiedTranscriptCount} transcripts, ${legacyHydration.copiedBackupCount} backups copied)` : "Scanning transcript files"
  });
  const discoverStartedAt = Date.now();
  const transcriptFiles = await discoverTranscriptFiles({
    rootDir,
    transcriptsDir,
    codexSessionsDir,
    includeCodexSessions: options.includeCodexSessions,
    maxTranscripts: options.maxTranscripts
  });
  const discoverMs = Date.now() - discoverStartedAt;
  const transcriptIrs = [];
  const extractStartedAt = Date.now();
  for (let index = 0;index < transcriptFiles.length; index++) {
    const transcript = transcriptFiles[index];
    await reportProgress(options.onProgress, {
      phase: "extract",
      message: `Extracting memory from ${transcript.relativePath}`,
      completed: index,
      total: transcriptFiles.length
    });
    transcriptIrs.push(await extractTranscriptIR({
      transcript,
      rootDir
    }));
  }
  await reportProgress(options.onProgress, {
    phase: "extract",
    message: transcriptFiles.length === 0 ? "No transcripts found" : `Extracted ${transcriptFiles.length} transcript files`,
    completed: transcriptFiles.length,
    total: transcriptFiles.length
  });
  const extractMs = Date.now() - extractStartedAt;
  const diffStartedAt = Date.now();
  const codeEdits = [];
  const codeEditCounts = new Map;
  for (let index = 0;index < transcriptIrs.length; index++) {
    const transcript = transcriptIrs[index];
    await reportProgress(options.onProgress, {
      phase: "diff",
      message: `Reconstructing code diffs from ${transcript.transcriptRelativePath}`,
      completed: index,
      total: transcriptIrs.length
    });
    const edits = await buildCodeEditEvents({
      rootDir,
      fileHistoryDir,
      transcript
    });
    codeEditCounts.set(transcript.transcriptPath, edits.length);
    codeEdits.push(...edits);
  }
  await reportProgress(options.onProgress, {
    phase: "diff",
    message: transcriptIrs.length === 0 ? "No transcript diffs to reconstruct" : `Reconstructed ${codeEdits.length} code-edit events`,
    completed: transcriptIrs.length,
    total: transcriptIrs.length
  });
  const diffMs = Date.now() - diffStartedAt;
  const prompts = sortByTimestamp(transcriptIrs.flatMap((transcript) => transcript.prompts));
  const plans = sortByTimestamp(transcriptIrs.flatMap((transcript) => transcript.plans));
  const memoryObjects = buildMemoryObjects({
    prompts,
    plans
  });
  const files = buildFileStats(codeEdits);
  const transcripts = buildTranscriptSummaries({
    transcripts: transcriptIrs,
    codeEditCounts
  });
  const sessions = buildSessionSummaries({
    transcripts,
    prompts,
    plans,
    codeEdits
  });
  const edges = buildEdges({
    transcripts,
    prompts,
    plans,
    codeEdits
  });
  const manifest = {
    artifactVersion: ARTIFACT_VERSION,
    rootDir,
    outputDir,
    transcriptsDir,
    fileHistoryDir,
    codexSessionsDir,
    legacyClaudeProjectDir: options.includeLegacyClaude ? legacyHydration.legacyProjectDir : undefined,
    legacyHydratedTranscriptCount: options.includeLegacyClaude ? legacyHydration.copiedTranscriptCount : undefined,
    legacyHydratedBackupCount: options.includeLegacyClaude ? legacyHydration.copiedBackupCount : undefined,
    createdAt: new Date().toISOString(),
    transcriptCount: transcripts.length,
    sessionCount: new Set(transcripts.map((transcript) => transcript.sessionId)).size,
    userPromptCount: prompts.length,
    planCount: plans.length,
    codeEditCount: codeEdits.length,
    memoryObjectCount: memoryObjects.length,
    fileCount: files.length,
    edgeCount: edges.length,
    maxTranscripts: options.maxTranscripts
  };
  const analyzeStartedAt = Date.now();
  const graphInput = buildMemoryGraphAnalysisInput({
    manifest,
    sessions,
    prompts,
    plans,
    codeEdits,
    memoryObjects,
    files
  });
  await reportProgress(options.onProgress, {
    phase: "analyze",
    message: options.analyzeGraph ? "Analyzing memory graph relationships" : "Building heuristic memory graph relationships"
  });
  let graphDraft;
  try {
    graphDraft = await options.analyzeGraph?.(graphInput);
  } catch {
    graphDraft = null;
  }
  const graphAnalysis = normalizeMemoryGraphAnalysis({
    input: graphInput,
    draft: graphDraft
  });
  const analyzeMs = Date.now() - analyzeStartedAt;
  await reportProgress(options.onProgress, {
    phase: "analyze",
    message: graphAnalysis.source === "agent" ? `Analyzed memory graph with internal agent (${graphAnalysis.topics.length} topics, ${graphAnalysis.edges.length} edges)` : `Built heuristic memory graph (${graphAnalysis.topics.length} topics, ${graphAnalysis.edges.length} edges)`
  });
  const writeStartedAt = Date.now();
  await reportProgress(options.onProgress, {
    phase: "write",
    message: "Writing memory index artifacts"
  });
  await writeMemoryIndexFiles({
    outputDir,
    manifest,
    sessions,
    transcripts,
    prompts,
    plans,
    codeEdits,
    memoryObjects,
    files,
    edges,
    graphAnalysis
  });
  const writeMs = Date.now() - writeStartedAt;
  const skillsStartedAt = Date.now();
  await reportProgress(options.onProgress, {
    phase: "skills",
    message: "Refreshing memory-index skills"
  });
  const skillPaths = await writeMemoryIndexSkills({
    rootDir,
    outputDir
  });
  const skillsMs = Date.now() - skillsStartedAt;
  const totalMs = Date.now() - startedAt;
  await reportProgress(options.onProgress, {
    phase: "complete",
    message: `Memory index complete in ${totalMs}ms`
  });
  return {
    engine: "transcript",
    rootDir,
    outputDir,
    transcriptsDir,
    fileHistoryDir,
    codexSessionsDir,
    graphSource: graphAnalysis.source,
    manifest,
    timings: {
      discoverMs,
      extractMs,
      diffMs,
      analyzeMs,
      writeMs,
      skillsMs,
      totalMs
    },
    skillPaths,
    transcriptCount: transcripts.length,
    sessionCount: manifest.sessionCount
  };
}

// src/memoryIndex/autoMemoryIndexWorker.ts
function describeError(error) {
  return error instanceof Error ? error.message : String(error);
}
if (!parentPort) {
  throw new Error("auto memory-index worker requires a parent port");
}
parentPort.on("message", async (request) => {
  let response;
  try {
    await buildMemoryIndex({
      rootDir: request.rootDir,
      outputDir: request.outputDir
    });
    response = { ok: true };
  } catch (error) {
    response = {
      ok: false,
      error: describeError(error)
    };
  }
  parentPort.postMessage(response);
});
