var __create = Object.create;
var __getProtoOf = Object.getPrototypeOf;
var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __toESM = (mod, isNodeMode, target) => {
  target = mod != null ? __create(__getProtoOf(mod)) : {};
  const to = isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target;
  for (let key of __getOwnPropNames(mod))
    if (!__hasOwnProp.call(to, key))
      __defProp(to, key, {
        get: () => mod[key],
        enumerable: true
      });
  return to;
};
var __commonJS = (cb, mod) => () => (mod || cb((mod = { exports: {} }).exports, mod), mod.exports);

// node_modules/prismjs/prism.js
var require_prism = __commonJS((exports, module) => {
  var _self = typeof window !== "undefined" ? window : typeof WorkerGlobalScope !== "undefined" && self instanceof WorkerGlobalScope ? self : {};
  var Prism2 = function(_self2) {
    var lang = /(?:^|\s)lang(?:uage)?-([\w-]+)(?=\s|$)/i;
    var uniqueId = 0;
    var plainTextGrammar = {};
    var _ = {
      manual: _self2.Prism && _self2.Prism.manual,
      disableWorkerMessageHandler: _self2.Prism && _self2.Prism.disableWorkerMessageHandler,
      util: {
        encode: function encode(tokens) {
          if (tokens instanceof Token) {
            return new Token(tokens.type, encode(tokens.content), tokens.alias);
          } else if (Array.isArray(tokens)) {
            return tokens.map(encode);
          } else {
            return tokens.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/\u00a0/g, " ");
          }
        },
        type: function(o) {
          return Object.prototype.toString.call(o).slice(8, -1);
        },
        objId: function(obj) {
          if (!obj["__id"]) {
            Object.defineProperty(obj, "__id", { value: ++uniqueId });
          }
          return obj["__id"];
        },
        clone: function deepClone(o, visited) {
          visited = visited || {};
          var clone;
          var id;
          switch (_.util.type(o)) {
            case "Object":
              id = _.util.objId(o);
              if (visited[id]) {
                return visited[id];
              }
              clone = {};
              visited[id] = clone;
              for (var key in o) {
                if (o.hasOwnProperty(key)) {
                  clone[key] = deepClone(o[key], visited);
                }
              }
              return clone;
            case "Array":
              id = _.util.objId(o);
              if (visited[id]) {
                return visited[id];
              }
              clone = [];
              visited[id] = clone;
              o.forEach(function(v, i) {
                clone[i] = deepClone(v, visited);
              });
              return clone;
            default:
              return o;
          }
        },
        getLanguage: function(element) {
          while (element) {
            var m = lang.exec(element.className);
            if (m) {
              return m[1].toLowerCase();
            }
            element = element.parentElement;
          }
          return "none";
        },
        setLanguage: function(element, language) {
          element.className = element.className.replace(RegExp(lang, "gi"), "");
          element.classList.add("language-" + language);
        },
        currentScript: function() {
          if (typeof document === "undefined") {
            return null;
          }
          if (document.currentScript && document.currentScript.tagName === "SCRIPT" && 1 < 2) {
            return document.currentScript;
          }
          try {
            throw new Error;
          } catch (err) {
            var src = (/at [^(\r\n]*\((.*):[^:]+:[^:]+\)$/i.exec(err.stack) || [])[1];
            if (src) {
              var scripts = document.getElementsByTagName("script");
              for (var i in scripts) {
                if (scripts[i].src == src) {
                  return scripts[i];
                }
              }
            }
            return null;
          }
        },
        isActive: function(element, className, defaultActivation) {
          var no = "no-" + className;
          while (element) {
            var classList = element.classList;
            if (classList.contains(className)) {
              return true;
            }
            if (classList.contains(no)) {
              return false;
            }
            element = element.parentElement;
          }
          return !!defaultActivation;
        }
      },
      languages: {
        plain: plainTextGrammar,
        plaintext: plainTextGrammar,
        text: plainTextGrammar,
        txt: plainTextGrammar,
        extend: function(id, redef) {
          var lang2 = _.util.clone(_.languages[id]);
          for (var key in redef) {
            lang2[key] = redef[key];
          }
          return lang2;
        },
        insertBefore: function(inside, before, insert, root) {
          root = root || _.languages;
          var grammar = root[inside];
          var ret = {};
          for (var token in grammar) {
            if (grammar.hasOwnProperty(token)) {
              if (token == before) {
                for (var newToken in insert) {
                  if (insert.hasOwnProperty(newToken)) {
                    ret[newToken] = insert[newToken];
                  }
                }
              }
              if (!insert.hasOwnProperty(token)) {
                ret[token] = grammar[token];
              }
            }
          }
          var old = root[inside];
          root[inside] = ret;
          _.languages.DFS(_.languages, function(key, value) {
            if (value === old && key != inside) {
              this[key] = ret;
            }
          });
          return ret;
        },
        DFS: function DFS(o, callback, type, visited) {
          visited = visited || {};
          var objId = _.util.objId;
          for (var i in o) {
            if (o.hasOwnProperty(i)) {
              callback.call(o, i, o[i], type || i);
              var property = o[i];
              var propertyType = _.util.type(property);
              if (propertyType === "Object" && !visited[objId(property)]) {
                visited[objId(property)] = true;
                DFS(property, callback, null, visited);
              } else if (propertyType === "Array" && !visited[objId(property)]) {
                visited[objId(property)] = true;
                DFS(property, callback, i, visited);
              }
            }
          }
        }
      },
      plugins: {},
      highlightAll: function(async, callback) {
        _.highlightAllUnder(document, async, callback);
      },
      highlightAllUnder: function(container, async, callback) {
        var env = {
          callback,
          container,
          selector: 'code[class*="language-"], [class*="language-"] code, code[class*="lang-"], [class*="lang-"] code'
        };
        _.hooks.run("before-highlightall", env);
        env.elements = Array.prototype.slice.apply(env.container.querySelectorAll(env.selector));
        _.hooks.run("before-all-elements-highlight", env);
        for (var i = 0, element;element = env.elements[i++]; ) {
          _.highlightElement(element, async === true, env.callback);
        }
      },
      highlightElement: function(element, async, callback) {
        var language = _.util.getLanguage(element);
        var grammar = _.languages[language];
        _.util.setLanguage(element, language);
        var parent = element.parentElement;
        if (parent && parent.nodeName.toLowerCase() === "pre") {
          _.util.setLanguage(parent, language);
        }
        var code = element.textContent;
        var env = {
          element,
          language,
          grammar,
          code
        };
        function insertHighlightedCode(highlightedCode) {
          env.highlightedCode = highlightedCode;
          _.hooks.run("before-insert", env);
          env.element.innerHTML = env.highlightedCode;
          _.hooks.run("after-highlight", env);
          _.hooks.run("complete", env);
          callback && callback.call(env.element);
        }
        _.hooks.run("before-sanity-check", env);
        parent = env.element.parentElement;
        if (parent && parent.nodeName.toLowerCase() === "pre" && !parent.hasAttribute("tabindex")) {
          parent.setAttribute("tabindex", "0");
        }
        if (!env.code) {
          _.hooks.run("complete", env);
          callback && callback.call(env.element);
          return;
        }
        _.hooks.run("before-highlight", env);
        if (!env.grammar) {
          insertHighlightedCode(_.util.encode(env.code));
          return;
        }
        if (async && _self2.Worker) {
          var worker = new Worker(_.filename);
          worker.onmessage = function(evt) {
            insertHighlightedCode(evt.data);
          };
          worker.postMessage(JSON.stringify({
            language: env.language,
            code: env.code,
            immediateClose: true
          }));
        } else {
          insertHighlightedCode(_.highlight(env.code, env.grammar, env.language));
        }
      },
      highlight: function(text, grammar, language) {
        var env = {
          code: text,
          grammar,
          language
        };
        _.hooks.run("before-tokenize", env);
        if (!env.grammar) {
          throw new Error('The language "' + env.language + '" has no grammar.');
        }
        env.tokens = _.tokenize(env.code, env.grammar);
        _.hooks.run("after-tokenize", env);
        return Token.stringify(_.util.encode(env.tokens), env.language);
      },
      tokenize: function(text, grammar) {
        var rest = grammar.rest;
        if (rest) {
          for (var token in rest) {
            grammar[token] = rest[token];
          }
          delete grammar.rest;
        }
        var tokenList = new LinkedList;
        addAfter(tokenList, tokenList.head, text);
        matchGrammar(text, tokenList, grammar, tokenList.head, 0);
        return toArray(tokenList);
      },
      hooks: {
        all: {},
        add: function(name, callback) {
          var hooks = _.hooks.all;
          hooks[name] = hooks[name] || [];
          hooks[name].push(callback);
        },
        run: function(name, env) {
          var callbacks = _.hooks.all[name];
          if (!callbacks || !callbacks.length) {
            return;
          }
          for (var i = 0, callback;callback = callbacks[i++]; ) {
            callback(env);
          }
        }
      },
      Token
    };
    _self2.Prism = _;
    function Token(type, content, alias, matchedStr) {
      this.type = type;
      this.content = content;
      this.alias = alias;
      this.length = (matchedStr || "").length | 0;
    }
    Token.stringify = function stringify(o, language) {
      if (typeof o == "string") {
        return o;
      }
      if (Array.isArray(o)) {
        var s = "";
        o.forEach(function(e) {
          s += stringify(e, language);
        });
        return s;
      }
      var env = {
        type: o.type,
        content: stringify(o.content, language),
        tag: "span",
        classes: ["token", o.type],
        attributes: {},
        language
      };
      var aliases = o.alias;
      if (aliases) {
        if (Array.isArray(aliases)) {
          Array.prototype.push.apply(env.classes, aliases);
        } else {
          env.classes.push(aliases);
        }
      }
      _.hooks.run("wrap", env);
      var attributes = "";
      for (var name in env.attributes) {
        attributes += " " + name + '="' + (env.attributes[name] || "").replace(/"/g, "&quot;") + '"';
      }
      return "<" + env.tag + ' class="' + env.classes.join(" ") + '"' + attributes + ">" + env.content + "</" + env.tag + ">";
    };
    function matchPattern(pattern, pos, text, lookbehind) {
      pattern.lastIndex = pos;
      var match = pattern.exec(text);
      if (match && lookbehind && match[1]) {
        var lookbehindLength = match[1].length;
        match.index += lookbehindLength;
        match[0] = match[0].slice(lookbehindLength);
      }
      return match;
    }
    function matchGrammar(text, tokenList, grammar, startNode, startPos, rematch) {
      for (var token in grammar) {
        if (!grammar.hasOwnProperty(token) || !grammar[token]) {
          continue;
        }
        var patterns = grammar[token];
        patterns = Array.isArray(patterns) ? patterns : [patterns];
        for (var j = 0;j < patterns.length; ++j) {
          if (rematch && rematch.cause == token + "," + j) {
            return;
          }
          var patternObj = patterns[j];
          var inside = patternObj.inside;
          var lookbehind = !!patternObj.lookbehind;
          var greedy = !!patternObj.greedy;
          var alias = patternObj.alias;
          if (greedy && !patternObj.pattern.global) {
            var flags = patternObj.pattern.toString().match(/[imsuy]*$/)[0];
            patternObj.pattern = RegExp(patternObj.pattern.source, flags + "g");
          }
          var pattern = patternObj.pattern || patternObj;
          for (var currentNode = startNode.next, pos = startPos;currentNode !== tokenList.tail; pos += currentNode.value.length, currentNode = currentNode.next) {
            if (rematch && pos >= rematch.reach) {
              break;
            }
            var str = currentNode.value;
            if (tokenList.length > text.length) {
              return;
            }
            if (str instanceof Token) {
              continue;
            }
            var removeCount = 1;
            var match;
            if (greedy) {
              match = matchPattern(pattern, pos, text, lookbehind);
              if (!match || match.index >= text.length) {
                break;
              }
              var from = match.index;
              var to = match.index + match[0].length;
              var p = pos;
              p += currentNode.value.length;
              while (from >= p) {
                currentNode = currentNode.next;
                p += currentNode.value.length;
              }
              p -= currentNode.value.length;
              pos = p;
              if (currentNode.value instanceof Token) {
                continue;
              }
              for (var k = currentNode;k !== tokenList.tail && (p < to || typeof k.value === "string"); k = k.next) {
                removeCount++;
                p += k.value.length;
              }
              removeCount--;
              str = text.slice(pos, p);
              match.index -= pos;
            } else {
              match = matchPattern(pattern, 0, str, lookbehind);
              if (!match) {
                continue;
              }
            }
            var from = match.index;
            var matchStr = match[0];
            var before = str.slice(0, from);
            var after = str.slice(from + matchStr.length);
            var reach = pos + str.length;
            if (rematch && reach > rematch.reach) {
              rematch.reach = reach;
            }
            var removeFrom = currentNode.prev;
            if (before) {
              removeFrom = addAfter(tokenList, removeFrom, before);
              pos += before.length;
            }
            removeRange(tokenList, removeFrom, removeCount);
            var wrapped = new Token(token, inside ? _.tokenize(matchStr, inside) : matchStr, alias, matchStr);
            currentNode = addAfter(tokenList, removeFrom, wrapped);
            if (after) {
              addAfter(tokenList, currentNode, after);
            }
            if (removeCount > 1) {
              var nestedRematch = {
                cause: token + "," + j,
                reach
              };
              matchGrammar(text, tokenList, grammar, currentNode.prev, pos, nestedRematch);
              if (rematch && nestedRematch.reach > rematch.reach) {
                rematch.reach = nestedRematch.reach;
              }
            }
          }
        }
      }
    }
    function LinkedList() {
      var head = { value: null, prev: null, next: null };
      var tail = { value: null, prev: head, next: null };
      head.next = tail;
      this.head = head;
      this.tail = tail;
      this.length = 0;
    }
    function addAfter(list, node, value) {
      var next = node.next;
      var newNode = { value, prev: node, next };
      node.next = newNode;
      next.prev = newNode;
      list.length++;
      return newNode;
    }
    function removeRange(list, node, count) {
      var next = node.next;
      for (var i = 0;i < count && next !== list.tail; i++) {
        next = next.next;
      }
      node.next = next;
      next.prev = node;
      list.length -= i;
    }
    function toArray(list) {
      var array = [];
      var node = list.head.next;
      while (node !== list.tail) {
        array.push(node.value);
        node = node.next;
      }
      return array;
    }
    if (!_self2.document) {
      if (!_self2.addEventListener) {
        return _;
      }
      if (!_.disableWorkerMessageHandler) {
        _self2.addEventListener("message", function(evt) {
          var message = JSON.parse(evt.data);
          var lang2 = message.language;
          var code = message.code;
          var immediateClose = message.immediateClose;
          _self2.postMessage(_.highlight(code, _.languages[lang2], lang2));
          if (immediateClose) {
            _self2.close();
          }
        }, false);
      }
      return _;
    }
    var script = _.util.currentScript();
    if (script) {
      _.filename = script.src;
      if (script.hasAttribute("data-manual")) {
        _.manual = true;
      }
    }
    function highlightAutomaticallyCallback() {
      if (!_.manual) {
        _.highlightAll();
      }
    }
    if (!_.manual) {
      var readyState = document.readyState;
      if (readyState === "loading" || readyState === "interactive" && script && script.defer) {
        document.addEventListener("DOMContentLoaded", highlightAutomaticallyCallback);
      } else {
        if (window.requestAnimationFrame) {
          window.requestAnimationFrame(highlightAutomaticallyCallback);
        } else {
          window.setTimeout(highlightAutomaticallyCallback, 16);
        }
      }
    }
    return _;
  }(_self);
  if (typeof module !== "undefined" && module.exports) {
    module.exports = Prism2;
  }
  if (typeof global !== "undefined") {
    global.Prism = Prism2;
  }
  Prism2.languages.markup = {
    comment: {
      pattern: /<!--(?:(?!<!--)[\s\S])*?-->/,
      greedy: true
    },
    prolog: {
      pattern: /<\?[\s\S]+?\?>/,
      greedy: true
    },
    doctype: {
      pattern: /<!DOCTYPE(?:[^>"'[\]]|"[^"]*"|'[^']*')+(?:\[(?:[^<"'\]]|"[^"]*"|'[^']*'|<(?!!--)|<!--(?:[^-]|-(?!->))*-->)*\]\s*)?>/i,
      greedy: true,
      inside: {
        "internal-subset": {
          pattern: /(^[^\[]*\[)[\s\S]+(?=\]>$)/,
          lookbehind: true,
          greedy: true,
          inside: null
        },
        string: {
          pattern: /"[^"]*"|'[^']*'/,
          greedy: true
        },
        punctuation: /^<!|>$|[[\]]/,
        "doctype-tag": /^DOCTYPE/i,
        name: /[^\s<>'"]+/
      }
    },
    cdata: {
      pattern: /<!\[CDATA\[[\s\S]*?\]\]>/i,
      greedy: true
    },
    tag: {
      pattern: /<\/?(?!\d)[^\s>\/=$<%]+(?:\s(?:\s*[^\s>\/=]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s'">=]+(?=[\s>]))|(?=[\s/>])))+)?\s*\/?>/,
      greedy: true,
      inside: {
        tag: {
          pattern: /^<\/?[^\s>\/]+/,
          inside: {
            punctuation: /^<\/?/,
            namespace: /^[^\s>\/:]+:/
          }
        },
        "special-attr": [],
        "attr-value": {
          pattern: /=\s*(?:"[^"]*"|'[^']*'|[^\s'">=]+)/,
          inside: {
            punctuation: [
              {
                pattern: /^=/,
                alias: "attr-equals"
              },
              {
                pattern: /^(\s*)["']|["']$/,
                lookbehind: true
              }
            ]
          }
        },
        punctuation: /\/?>/,
        "attr-name": {
          pattern: /[^\s>\/]+/,
          inside: {
            namespace: /^[^\s>\/:]+:/
          }
        }
      }
    },
    entity: [
      {
        pattern: /&[\da-z]{1,8};/i,
        alias: "named-entity"
      },
      /&#x?[\da-f]{1,8};/i
    ]
  };
  Prism2.languages.markup["tag"].inside["attr-value"].inside["entity"] = Prism2.languages.markup["entity"];
  Prism2.languages.markup["doctype"].inside["internal-subset"].inside = Prism2.languages.markup;
  Prism2.hooks.add("wrap", function(env) {
    if (env.type === "entity") {
      env.attributes["title"] = env.content.replace(/&amp;/, "&");
    }
  });
  Object.defineProperty(Prism2.languages.markup.tag, "addInlined", {
    value: function addInlined(tagName, lang) {
      var includedCdataInside = {};
      includedCdataInside["language-" + lang] = {
        pattern: /(^<!\[CDATA\[)[\s\S]+?(?=\]\]>$)/i,
        lookbehind: true,
        inside: Prism2.languages[lang]
      };
      includedCdataInside["cdata"] = /^<!\[CDATA\[|\]\]>$/i;
      var inside = {
        "included-cdata": {
          pattern: /<!\[CDATA\[[\s\S]*?\]\]>/i,
          inside: includedCdataInside
        }
      };
      inside["language-" + lang] = {
        pattern: /[\s\S]+/,
        inside: Prism2.languages[lang]
      };
      var def = {};
      def[tagName] = {
        pattern: RegExp(/(<__[^>]*>)(?:<!\[CDATA\[(?:[^\]]|\](?!\]>))*\]\]>|(?!<!\[CDATA\[)[\s\S])*?(?=<\/__>)/.source.replace(/__/g, function() {
          return tagName;
        }), "i"),
        lookbehind: true,
        greedy: true,
        inside
      };
      Prism2.languages.insertBefore("markup", "cdata", def);
    }
  });
  Object.defineProperty(Prism2.languages.markup.tag, "addAttribute", {
    value: function(attrName, lang) {
      Prism2.languages.markup.tag.inside["special-attr"].push({
        pattern: RegExp(/(^|["'\s])/.source + "(?:" + attrName + ")" + /\s*=\s*(?:"[^"]*"|'[^']*'|[^\s'">=]+(?=[\s>]))/.source, "i"),
        lookbehind: true,
        inside: {
          "attr-name": /^[^\s=]+/,
          "attr-value": {
            pattern: /=[\s\S]+/,
            inside: {
              value: {
                pattern: /(^=\s*(["']|(?!["'])))\S[\s\S]*(?=\2$)/,
                lookbehind: true,
                alias: [lang, "language-" + lang],
                inside: Prism2.languages[lang]
              },
              punctuation: [
                {
                  pattern: /^=/,
                  alias: "attr-equals"
                },
                /"|'/
              ]
            }
          }
        }
      });
    }
  });
  Prism2.languages.html = Prism2.languages.markup;
  Prism2.languages.mathml = Prism2.languages.markup;
  Prism2.languages.svg = Prism2.languages.markup;
  Prism2.languages.xml = Prism2.languages.extend("markup", {});
  Prism2.languages.ssml = Prism2.languages.xml;
  Prism2.languages.atom = Prism2.languages.xml;
  Prism2.languages.rss = Prism2.languages.xml;
  (function(Prism3) {
    var string = /(?:"(?:\\(?:\r\n|[\s\S])|[^"\\\r\n])*"|'(?:\\(?:\r\n|[\s\S])|[^'\\\r\n])*')/;
    Prism3.languages.css = {
      comment: /\/\*[\s\S]*?\*\//,
      atrule: {
        pattern: RegExp("@[\\w-](?:" + /[^;{\s"']|\s+(?!\s)/.source + "|" + string.source + ")*?" + /(?:;|(?=\s*\{))/.source),
        inside: {
          rule: /^@[\w-]+/,
          "selector-function-argument": {
            pattern: /(\bselector\s*\(\s*(?![\s)]))(?:[^()\s]|\s+(?![\s)])|\((?:[^()]|\([^()]*\))*\))+(?=\s*\))/,
            lookbehind: true,
            alias: "selector"
          },
          keyword: {
            pattern: /(^|[^\w-])(?:and|not|only|or)(?![\w-])/,
            lookbehind: true
          }
        }
      },
      url: {
        pattern: RegExp("\\burl\\((?:" + string.source + "|" + /(?:[^\\\r\n()"']|\\[\s\S])*/.source + ")\\)", "i"),
        greedy: true,
        inside: {
          function: /^url/i,
          punctuation: /^\(|\)$/,
          string: {
            pattern: RegExp("^" + string.source + "$"),
            alias: "url"
          }
        }
      },
      selector: {
        pattern: RegExp(`(^|[{}\\s])[^{}\\s](?:[^{};"'\\s]|\\s+(?![\\s{])|` + string.source + ")*(?=\\s*\\{)"),
        lookbehind: true
      },
      string: {
        pattern: string,
        greedy: true
      },
      property: {
        pattern: /(^|[^-\w\xA0-\uFFFF])(?!\s)[-_a-z\xA0-\uFFFF](?:(?!\s)[-\w\xA0-\uFFFF])*(?=\s*:)/i,
        lookbehind: true
      },
      important: /!important\b/i,
      function: {
        pattern: /(^|[^-a-z0-9])[-a-z0-9]+(?=\()/i,
        lookbehind: true
      },
      punctuation: /[(){};:,]/
    };
    Prism3.languages.css["atrule"].inside.rest = Prism3.languages.css;
    var markup = Prism3.languages.markup;
    if (markup) {
      markup.tag.addInlined("style", "css");
      markup.tag.addAttribute("style", "css");
    }
  })(Prism2);
  Prism2.languages.clike = {
    comment: [
      {
        pattern: /(^|[^\\])\/\*[\s\S]*?(?:\*\/|$)/,
        lookbehind: true,
        greedy: true
      },
      {
        pattern: /(^|[^\\:])\/\/.*/,
        lookbehind: true,
        greedy: true
      }
    ],
    string: {
      pattern: /(["'])(?:\\(?:\r\n|[\s\S])|(?!\1)[^\\\r\n])*\1/,
      greedy: true
    },
    "class-name": {
      pattern: /(\b(?:class|extends|implements|instanceof|interface|new|trait)\s+|\bcatch\s+\()[\w.\\]+/i,
      lookbehind: true,
      inside: {
        punctuation: /[.\\]/
      }
    },
    keyword: /\b(?:break|catch|continue|do|else|finally|for|function|if|in|instanceof|new|null|return|throw|try|while)\b/,
    boolean: /\b(?:false|true)\b/,
    function: /\b\w+(?=\()/,
    number: /\b0x[\da-f]+\b|(?:\b\d+(?:\.\d*)?|\B\.\d+)(?:e[+-]?\d+)?/i,
    operator: /[<>]=?|[!=]=?=?|--?|\+\+?|&&?|\|\|?|[?*/~^%]/,
    punctuation: /[{}[\];(),.:]/
  };
  Prism2.languages.javascript = Prism2.languages.extend("clike", {
    "class-name": [
      Prism2.languages.clike["class-name"],
      {
        pattern: /(^|[^$\w\xA0-\uFFFF])(?!\s)[_$A-Z\xA0-\uFFFF](?:(?!\s)[$\w\xA0-\uFFFF])*(?=\.(?:constructor|prototype))/,
        lookbehind: true
      }
    ],
    keyword: [
      {
        pattern: /((?:^|\})\s*)catch\b/,
        lookbehind: true
      },
      {
        pattern: /(^|[^.]|\.\.\.\s*)\b(?:as|assert(?=\s*\{)|async(?=\s*(?:function\b|\(|[$\w\xA0-\uFFFF]|$))|await|break|case|class|const|continue|debugger|default|delete|do|else|enum|export|extends|finally(?=\s*(?:\{|$))|for|from(?=\s*(?:['"]|$))|function|(?:get|set)(?=\s*(?:[#\[$\w\xA0-\uFFFF]|$))|if|implements|import|in|instanceof|interface|let|new|null|of|package|private|protected|public|return|static|super|switch|this|throw|try|typeof|undefined|var|void|while|with|yield)\b/,
        lookbehind: true
      }
    ],
    function: /#?(?!\s)[_$a-zA-Z\xA0-\uFFFF](?:(?!\s)[$\w\xA0-\uFFFF])*(?=\s*(?:\.\s*(?:apply|bind|call)\s*)?\()/,
    number: {
      pattern: RegExp(/(^|[^\w$])/.source + "(?:" + (/NaN|Infinity/.source + "|" + /0[bB][01]+(?:_[01]+)*n?/.source + "|" + /0[oO][0-7]+(?:_[0-7]+)*n?/.source + "|" + /0[xX][\dA-Fa-f]+(?:_[\dA-Fa-f]+)*n?/.source + "|" + /\d+(?:_\d+)*n/.source + "|" + /(?:\d+(?:_\d+)*(?:\.(?:\d+(?:_\d+)*)?)?|\.\d+(?:_\d+)*)(?:[Ee][+-]?\d+(?:_\d+)*)?/.source) + ")" + /(?![\w$])/.source),
      lookbehind: true
    },
    operator: /--|\+\+|\*\*=?|=>|&&=?|\|\|=?|[!=]==|<<=?|>>>?=?|[-+*/%&|^!=<>]=?|\.{3}|\?\?=?|\?\.?|[~:]/
  });
  Prism2.languages.javascript["class-name"][0].pattern = /(\b(?:class|extends|implements|instanceof|interface|new)\s+)[\w.\\]+/;
  Prism2.languages.insertBefore("javascript", "keyword", {
    regex: {
      pattern: RegExp(/((?:^|[^$\w\xA0-\uFFFF."'\])\s]|\b(?:return|yield))\s*)/.source + /\//.source + "(?:" + /(?:\[(?:[^\]\\\r\n]|\\.)*\]|\\.|[^/\\\[\r\n])+\/[dgimyus]{0,7}/.source + "|" + /(?:\[(?:[^[\]\\\r\n]|\\.|\[(?:[^[\]\\\r\n]|\\.|\[(?:[^[\]\\\r\n]|\\.)*\])*\])*\]|\\.|[^/\\\[\r\n])+\/[dgimyus]{0,7}v[dgimyus]{0,7}/.source + ")" + /(?=(?:\s|\/\*(?:[^*]|\*(?!\/))*\*\/)*(?:$|[\r\n,.;:})\]]|\/\/))/.source),
      lookbehind: true,
      greedy: true,
      inside: {
        "regex-source": {
          pattern: /^(\/)[\s\S]+(?=\/[a-z]*$)/,
          lookbehind: true,
          alias: "language-regex",
          inside: Prism2.languages.regex
        },
        "regex-delimiter": /^\/|\/$/,
        "regex-flags": /^[a-z]+$/
      }
    },
    "function-variable": {
      pattern: /#?(?!\s)[_$a-zA-Z\xA0-\uFFFF](?:(?!\s)[$\w\xA0-\uFFFF])*(?=\s*[=:]\s*(?:async\s*)?(?:\bfunction\b|(?:\((?:[^()]|\([^()]*\))*\)|(?!\s)[_$a-zA-Z\xA0-\uFFFF](?:(?!\s)[$\w\xA0-\uFFFF])*)\s*=>))/,
      alias: "function"
    },
    parameter: [
      {
        pattern: /(function(?:\s+(?!\s)[_$a-zA-Z\xA0-\uFFFF](?:(?!\s)[$\w\xA0-\uFFFF])*)?\s*\(\s*)(?!\s)(?:[^()\s]|\s+(?![\s)])|\([^()]*\))+(?=\s*\))/,
        lookbehind: true,
        inside: Prism2.languages.javascript
      },
      {
        pattern: /(^|[^$\w\xA0-\uFFFF])(?!\s)[_$a-z\xA0-\uFFFF](?:(?!\s)[$\w\xA0-\uFFFF])*(?=\s*=>)/i,
        lookbehind: true,
        inside: Prism2.languages.javascript
      },
      {
        pattern: /(\(\s*)(?!\s)(?:[^()\s]|\s+(?![\s)])|\([^()]*\))+(?=\s*\)\s*=>)/,
        lookbehind: true,
        inside: Prism2.languages.javascript
      },
      {
        pattern: /((?:\b|\s|^)(?!(?:as|async|await|break|case|catch|class|const|continue|debugger|default|delete|do|else|enum|export|extends|finally|for|from|function|get|if|implements|import|in|instanceof|interface|let|new|null|of|package|private|protected|public|return|set|static|super|switch|this|throw|try|typeof|undefined|var|void|while|with|yield)(?![$\w\xA0-\uFFFF]))(?:(?!\s)[_$a-zA-Z\xA0-\uFFFF](?:(?!\s)[$\w\xA0-\uFFFF])*\s*)\(\s*|\]\s*\(\s*)(?!\s)(?:[^()\s]|\s+(?![\s)])|\([^()]*\))+(?=\s*\)\s*\{)/,
        lookbehind: true,
        inside: Prism2.languages.javascript
      }
    ],
    constant: /\b[A-Z](?:[A-Z_]|\dx?)*\b/
  });
  Prism2.languages.insertBefore("javascript", "string", {
    hashbang: {
      pattern: /^#!.*/,
      greedy: true,
      alias: "comment"
    },
    "template-string": {
      pattern: /`(?:\\[\s\S]|\$\{(?:[^{}]|\{(?:[^{}]|\{[^}]*\})*\})+\}|(?!\$\{)[^\\`])*`/,
      greedy: true,
      inside: {
        "template-punctuation": {
          pattern: /^`|`$/,
          alias: "string"
        },
        interpolation: {
          pattern: /((?:^|[^\\])(?:\\{2})*)\$\{(?:[^{}]|\{(?:[^{}]|\{[^}]*\})*\})+\}/,
          lookbehind: true,
          inside: {
            "interpolation-punctuation": {
              pattern: /^\$\{|\}$/,
              alias: "punctuation"
            },
            rest: Prism2.languages.javascript
          }
        },
        string: /[\s\S]+/
      }
    },
    "string-property": {
      pattern: /((?:^|[,{])[ \t]*)(["'])(?:\\(?:\r\n|[\s\S])|(?!\2)[^\\\r\n])*\2(?=\s*:)/m,
      lookbehind: true,
      greedy: true,
      alias: "property"
    }
  });
  Prism2.languages.insertBefore("javascript", "operator", {
    "literal-property": {
      pattern: /((?:^|[,{])[ \t]*)(?!\s)[_$a-zA-Z\xA0-\uFFFF](?:(?!\s)[$\w\xA0-\uFFFF])*(?=\s*:)/m,
      lookbehind: true,
      alias: "property"
    }
  });
  if (Prism2.languages.markup) {
    Prism2.languages.markup.tag.addInlined("script", "javascript");
    Prism2.languages.markup.tag.addAttribute(/on(?:abort|blur|change|click|composition(?:end|start|update)|dblclick|error|focus(?:in|out)?|key(?:down|up)|load|mouse(?:down|enter|leave|move|out|over|up)|reset|resize|scroll|select|slotchange|submit|unload|wheel)/.source, "javascript");
  }
  Prism2.languages.js = Prism2.languages.javascript;
  (function() {
    if (typeof Prism2 === "undefined" || typeof document === "undefined") {
      return;
    }
    if (!Element.prototype.matches) {
      Element.prototype.matches = Element.prototype.msMatchesSelector || Element.prototype.webkitMatchesSelector;
    }
    var LOADING_MESSAGE = "Loading…";
    var FAILURE_MESSAGE = function(status, message) {
      return "✖ Error " + status + " while fetching file: " + message;
    };
    var FAILURE_EMPTY_MESSAGE = "✖ Error: File does not exist or is empty";
    var EXTENSIONS = {
      js: "javascript",
      py: "python",
      rb: "ruby",
      ps1: "powershell",
      psm1: "powershell",
      sh: "bash",
      bat: "batch",
      h: "c",
      tex: "latex"
    };
    var STATUS_ATTR = "data-src-status";
    var STATUS_LOADING = "loading";
    var STATUS_LOADED = "loaded";
    var STATUS_FAILED = "failed";
    var SELECTOR = "pre[data-src]:not([" + STATUS_ATTR + '="' + STATUS_LOADED + '"])' + ":not([" + STATUS_ATTR + '="' + STATUS_LOADING + '"])';
    function loadFile(src, success, error) {
      var xhr = new XMLHttpRequest;
      xhr.open("GET", src, true);
      xhr.onreadystatechange = function() {
        if (xhr.readyState == 4) {
          if (xhr.status < 400 && xhr.responseText) {
            success(xhr.responseText);
          } else {
            if (xhr.status >= 400) {
              error(FAILURE_MESSAGE(xhr.status, xhr.statusText));
            } else {
              error(FAILURE_EMPTY_MESSAGE);
            }
          }
        }
      };
      xhr.send(null);
    }
    function parseRange(range) {
      var m = /^\s*(\d+)\s*(?:(,)\s*(?:(\d+)\s*)?)?$/.exec(range || "");
      if (m) {
        var start = Number(m[1]);
        var comma = m[2];
        var end = m[3];
        if (!comma) {
          return [start, start];
        }
        if (!end) {
          return [start, undefined];
        }
        return [start, Number(end)];
      }
      return;
    }
    Prism2.hooks.add("before-highlightall", function(env) {
      env.selector += ", " + SELECTOR;
    });
    Prism2.hooks.add("before-sanity-check", function(env) {
      var pre = env.element;
      if (pre.matches(SELECTOR)) {
        env.code = "";
        pre.setAttribute(STATUS_ATTR, STATUS_LOADING);
        var code = pre.appendChild(document.createElement("CODE"));
        code.textContent = LOADING_MESSAGE;
        var src = pre.getAttribute("data-src");
        var language = env.language;
        if (language === "none") {
          var extension = (/\.(\w+)$/.exec(src) || [, "none"])[1];
          language = EXTENSIONS[extension] || extension;
        }
        Prism2.util.setLanguage(code, language);
        Prism2.util.setLanguage(pre, language);
        var autoloader = Prism2.plugins.autoloader;
        if (autoloader) {
          autoloader.loadLanguages(language);
        }
        loadFile(src, function(text) {
          pre.setAttribute(STATUS_ATTR, STATUS_LOADED);
          var range = parseRange(pre.getAttribute("data-range"));
          if (range) {
            var lines = text.split(/\r\n?|\n/g);
            var start = range[0];
            var end = range[1] == null ? lines.length : range[1];
            if (start < 0) {
              start += lines.length;
            }
            start = Math.max(0, Math.min(start - 1, lines.length));
            if (end < 0) {
              end += lines.length;
            }
            end = Math.max(0, Math.min(end, lines.length));
            text = lines.slice(start, end).join(`
`);
            if (!pre.hasAttribute("data-start")) {
              pre.setAttribute("data-start", String(start + 1));
            }
          }
          code.textContent = text;
          Prism2.highlightElement(code);
        }, function(error) {
          pre.setAttribute(STATUS_ATTR, STATUS_FAILED);
          code.textContent = error;
        });
      }
    });
    Prism2.plugins.fileHighlight = {
      highlight: function highlight(container) {
        var elements = (container || document).querySelectorAll(SELECTOR);
        for (var i = 0, element;element = elements[i++]; ) {
          Prism2.highlightElement(element);
        }
      }
    };
    var logged = false;
    Prism2.fileHighlight = function() {
      if (!logged) {
        console.warn("Prism.fileHighlight is deprecated. Use `Prism.plugins.fileHighlight.highlight` instead.");
        logged = true;
      }
      Prism2.plugins.fileHighlight.highlight.apply(this, arguments);
    };
  })();
});

// node_modules/electrobun/dist/api/shared/rpc.ts
var MAX_ID = 10000000000;
var DEFAULT_MAX_REQUEST_TIME = 1000;
function missingTransportMethodError(methods, action) {
  const methodsString = methods.map((m) => `"${m}"`).join(", ");
  return new Error(`This RPC instance cannot ${action} because the transport did not provide one or more of these methods: ${methodsString}`);
}
function createRPC(options = {}) {
  let debugHooks = {};
  let transport = {};
  let requestHandler = undefined;
  function setTransport(newTransport) {
    if (transport.unregisterHandler)
      transport.unregisterHandler();
    transport = newTransport;
    transport.registerHandler?.(handler);
  }
  function setRequestHandler(h) {
    if (typeof h === "function") {
      requestHandler = h;
      return;
    }
    requestHandler = (method, params) => {
      const handlerFn = h[method];
      if (handlerFn)
        return handlerFn(params);
      const fallbackHandler = h._;
      if (!fallbackHandler)
        throw new Error(`The requested method has no handler: ${String(method)}`);
      return fallbackHandler(method, params);
    };
  }
  const { maxRequestTime = DEFAULT_MAX_REQUEST_TIME } = options;
  if (options.transport)
    setTransport(options.transport);
  if (options.requestHandler)
    setRequestHandler(options.requestHandler);
  if (options._debugHooks)
    debugHooks = options._debugHooks;
  let lastRequestId = 0;
  function getRequestId() {
    if (lastRequestId <= MAX_ID)
      return ++lastRequestId;
    return lastRequestId = 0;
  }
  const requestListeners = new Map;
  const requestTimeouts = new Map;
  function requestFn(method, ...args) {
    const params = args[0];
    return new Promise((resolve, reject) => {
      if (!transport.send)
        throw missingTransportMethodError(["send"], "make requests");
      const requestId = getRequestId();
      const request2 = {
        type: "request",
        id: requestId,
        method,
        params
      };
      requestListeners.set(requestId, { resolve, reject });
      if (maxRequestTime !== Infinity)
        requestTimeouts.set(requestId, setTimeout(() => {
          requestTimeouts.delete(requestId);
          reject(new Error("RPC request timed out."));
        }, maxRequestTime));
      debugHooks.onSend?.(request2);
      transport.send(request2);
    });
  }
  const request = new Proxy(requestFn, {
    get: (target, prop, receiver) => {
      if (prop in target)
        return Reflect.get(target, prop, receiver);
      return (params) => requestFn(prop, params);
    }
  });
  const requestProxy = request;
  function sendFn(message, ...args) {
    const payload = args[0];
    if (!transport.send)
      throw missingTransportMethodError(["send"], "send messages");
    const rpcMessage = {
      type: "message",
      id: message,
      payload
    };
    debugHooks.onSend?.(rpcMessage);
    transport.send(rpcMessage);
  }
  const send = new Proxy(sendFn, {
    get: (target, prop, receiver) => {
      if (prop in target)
        return Reflect.get(target, prop, receiver);
      return (payload) => sendFn(prop, payload);
    }
  });
  const sendProxy = send;
  const messageListeners = new Map;
  const wildcardMessageListeners = new Set;
  function addMessageListener(message, listener) {
    if (!transport.registerHandler)
      throw missingTransportMethodError(["registerHandler"], "register message listeners");
    if (message === "*") {
      wildcardMessageListeners.add(listener);
      return;
    }
    if (!messageListeners.has(message))
      messageListeners.set(message, new Set);
    messageListeners.get(message).add(listener);
  }
  function removeMessageListener(message, listener) {
    if (message === "*") {
      wildcardMessageListeners.delete(listener);
      return;
    }
    messageListeners.get(message)?.delete(listener);
    if (messageListeners.get(message)?.size === 0)
      messageListeners.delete(message);
  }
  async function handler(message) {
    debugHooks.onReceive?.(message);
    if (!("type" in message))
      throw new Error("Message does not contain a type.");
    if (message.type === "request") {
      if (!transport.send || !requestHandler)
        throw missingTransportMethodError(["send", "requestHandler"], "handle requests");
      const { id, method, params } = message;
      let response;
      try {
        response = {
          type: "response",
          id,
          success: true,
          payload: await requestHandler(method, params)
        };
      } catch (error) {
        if (!(error instanceof Error))
          throw error;
        response = {
          type: "response",
          id,
          success: false,
          error: error.message
        };
      }
      debugHooks.onSend?.(response);
      transport.send(response);
      return;
    }
    if (message.type === "response") {
      const timeout = requestTimeouts.get(message.id);
      if (timeout != null)
        clearTimeout(timeout);
      const { resolve, reject } = requestListeners.get(message.id) ?? {};
      if (!message.success)
        reject?.(new Error(message.error));
      else
        resolve?.(message.payload);
      return;
    }
    if (message.type === "message") {
      for (const listener of wildcardMessageListeners)
        listener(message.id, message.payload);
      const listeners = messageListeners.get(message.id);
      if (!listeners)
        return;
      for (const listener of listeners)
        listener(message.payload);
      return;
    }
    throw new Error(`Unexpected RPC message type: ${message.type}`);
  }
  const proxy = { send: sendProxy, request: requestProxy };
  return {
    setTransport,
    setRequestHandler,
    request,
    requestProxy,
    send,
    sendProxy,
    addMessageListener,
    removeMessageListener,
    proxy
  };
}
function defineElectrobunRPC(_side, config) {
  const rpcOptions = {
    maxRequestTime: config.maxRequestTime,
    requestHandler: {
      ...config.handlers.requests,
      ...config.extraRequestHandlers
    },
    transport: {
      registerHandler: () => {}
    }
  };
  const rpc = createRPC(rpcOptions);
  const messageHandlers = config.handlers.messages;
  if (messageHandlers) {
    rpc.addMessageListener("*", (messageName, payload) => {
      const globalHandler = messageHandlers["*"];
      if (globalHandler) {
        globalHandler(messageName, payload);
      }
      const messageHandler = messageHandlers[messageName];
      if (messageHandler) {
        messageHandler(payload);
      }
    });
  }
  return rpc;
}

// node_modules/electrobun/dist/api/browser/index.ts
var WEBVIEW_ID = window.__electrobunWebviewId;
var RPC_SOCKET_PORT = window.__electrobunRpcSocketPort;

class Electroview {
  bunSocket;
  rpc;
  rpcHandler;
  constructor(config) {
    this.rpc = config.rpc;
    this.init();
  }
  init() {
    this.initSocketToBun();
    window.__electrobun.receiveMessageFromBun = this.receiveMessageFromBun.bind(this);
    if (this.rpc) {
      this.rpc.setTransport(this.createTransport());
    }
  }
  initSocketToBun() {
    const socket = new WebSocket(`ws://localhost:${RPC_SOCKET_PORT}/socket?webviewId=${WEBVIEW_ID}`);
    this.bunSocket = socket;
    socket.addEventListener("open", () => {});
    socket.addEventListener("message", async (event) => {
      const message = event.data;
      if (typeof message === "string") {
        try {
          const encryptedPacket = JSON.parse(message);
          const decrypted = await window.__electrobun_decrypt(encryptedPacket.encryptedData, encryptedPacket.iv, encryptedPacket.tag);
          this.rpcHandler?.(JSON.parse(decrypted));
        } catch (err) {
          console.error("Error parsing bun message:", err);
        }
      } else if (message instanceof Blob) {} else {
        console.error("UNKNOWN DATA TYPE RECEIVED:", event.data);
      }
    });
    socket.addEventListener("error", (event) => {
      console.error("Socket error:", event);
    });
    socket.addEventListener("close", (_event) => {});
  }
  createTransport() {
    const that = this;
    return {
      send(message) {
        try {
          const messageString = JSON.stringify(message);
          that.bunBridge(messageString);
        } catch (error) {
          console.error("bun: failed to serialize message to webview", error);
        }
      },
      registerHandler(handler) {
        that.rpcHandler = handler;
      }
    };
  }
  async bunBridge(msg) {
    if (this.bunSocket?.readyState === WebSocket.OPEN) {
      try {
        const { encryptedData, iv, tag } = await window.__electrobun_encrypt(msg);
        const encryptedPacket = {
          encryptedData,
          iv,
          tag
        };
        const encryptedPacketString = JSON.stringify(encryptedPacket);
        this.bunSocket.send(encryptedPacketString);
        return;
      } catch (error) {
        console.error("Error sending message to bun via socket:", error);
      }
    }
    window.__electrobunBunBridge?.postMessage(msg);
  }
  receiveMessageFromBun(msg) {
    if (this.rpcHandler) {
      this.rpcHandler(msg);
    }
  }
  static defineRPC(config) {
    return defineElectrobunRPC("webview", {
      ...config,
      extraRequestHandlers: {
        evaluateJavascriptWithResponse: ({ script }) => {
          return new Promise((resolve) => {
            try {
              const resultFunction = new Function(script);
              const result = resultFunction();
              if (result instanceof Promise) {
                result.then((resolvedResult) => {
                  resolve(resolvedResult);
                }).catch((error) => {
                  console.error("bun: async script execution failed", error);
                  resolve(String(error));
                });
              } else {
                resolve(result);
              }
            } catch (error) {
              console.error("bun: failed to eval script", error);
              resolve(String(error));
            }
          });
        }
      }
    });
  }
}
var Electrobun = {
  Electroview
};
var browser_default = Electrobun;

// src/mainview/lib/state.ts
class Store {
  #state;
  #listeners = new Set;
  constructor(initial) {
    this.#state = initial;
  }
  get() {
    return this.#state;
  }
  set(next) {
    this.#state = next;
    for (const fn of this.#listeners) {
      fn(next);
    }
  }
  update(fn) {
    this.set(fn(this.#state));
  }
  subscribe(fn) {
    this.#listeners.add(fn);
    return () => this.#listeners.delete(fn);
  }
}

// src/mainview/lib/dom.ts
function h(tag, attrs, children) {
  const el = document.createElement(tag);
  if (attrs) {
    for (const [key, val] of Object.entries(attrs)) {
      if (key === "class" || key === "className") {
        el.className = val;
      } else if (key === "style" && typeof val === "object") {
        Object.assign(el.style, val);
      } else if (key.startsWith("on") && typeof val === "function") {
        el.addEventListener(key.slice(2).toLowerCase(), val);
      } else if (key === "dataset" && typeof val === "object") {
        for (const [dk, dv] of Object.entries(val)) {
          el.dataset[dk] = String(dv);
        }
      } else if (key === "hidden") {
        el.hidden = Boolean(val);
      } else if (key === "innerHTML") {
        el.innerHTML = val;
      } else {
        el.setAttribute(key, String(val));
      }
    }
  }
  if (children) {
    for (const child of children) {
      if (typeof child === "string") {
        el.appendChild(document.createTextNode(child));
      } else if (child) {
        el.appendChild(child);
      }
    }
  }
  return el;
}
function qs(selector, parent = document) {
  return parent.querySelector(selector);
}
function clearChildren(el) {
  while (el.firstChild)
    el.removeChild(el.firstChild);
}

// src/mainview/components/panel-layout.ts
class PanelLayout {
  #el;
  #panels = new Map;
  #order = [];
  #handles = [];
  #dragging = null;
  constructor(container, configs) {
    this.#el = h("div", { class: "panel-layout" });
    this.#order = configs.map((cfg) => cfg.id);
    for (let i = 0;i < configs.length; i++) {
      const cfg = configs[i];
      const panel = h("div", {
        class: `panel panel-${cfg.id}`,
        dataset: { panelId: cfg.id }
      });
      if (cfg.hidden) {
        panel.style.width = "0px";
        panel.style.minWidth = "0px";
        panel.classList.add("panel-hidden");
      } else {
        panel.style.width = cfg.defaultWidth + "%";
        panel.style.minWidth = cfg.minWidth + "px";
      }
      this.#panels.set(cfg.id, {
        el: panel,
        config: cfg,
        hidden: cfg.hidden ?? false,
        currentWidth: cfg.hidden ? 0 : cfg.defaultWidth
      });
      this.#el.appendChild(panel);
      if (i < configs.length - 1) {
        const handle = h("div", {
          class: "panel-handle",
          dataset: { handleIndex: String(i) }
        });
        this.#el.appendChild(handle);
        this.#handles.push(handle);
        handle.addEventListener("mousedown", (e) => {
          e.preventDefault();
          this.#startDrag(i, e.clientX, configs[i].id, configs[i + 1].id);
        });
      }
    }
    document.addEventListener("mousemove", (e) => this.#onDrag(e));
    document.addEventListener("mouseup", () => this.#endDrag());
    container.appendChild(this.#el);
    this.#rebalance();
  }
  getPanel(id) {
    return this.#panels.get(id)?.el ?? null;
  }
  showPanel(id) {
    const state = this.#panels.get(id);
    if (!state || !state.hidden)
      return;
    this.#captureCurrentWidths();
    state.hidden = false;
    state.el.classList.remove("panel-hidden");
    if (state.currentWidth <= 0) {
      state.currentWidth = this.#initialPercent(state.config);
    }
    state.el.style.width = "";
    state.el.style.minWidth = state.config.minWidth + "px";
    this.#rebalance();
  }
  hidePanel(id) {
    const state = this.#panels.get(id);
    if (!state || state.hidden)
      return;
    this.#captureCurrentWidths();
    state.hidden = true;
    state.el.classList.add("panel-hidden");
    state.el.style.width = "0px";
    state.el.style.minWidth = "0px";
    this.#rebalance();
  }
  togglePanel(id) {
    const state = this.#panels.get(id);
    if (!state)
      return;
    if (state.hidden)
      this.showPanel(id);
    else
      this.hidePanel(id);
  }
  isPanelVisible(id) {
    return !(this.#panels.get(id)?.hidden ?? true);
  }
  #startDrag(handleIndex, startX, leftId, rightId) {
    const leftPanel = this.#panels.get(leftId);
    const rightPanel = this.#panels.get(rightId);
    if (leftPanel.hidden || rightPanel.hidden)
      return;
    this.#dragging = {
      handleIndex,
      startX,
      leftId,
      rightId,
      leftStart: leftPanel.el.offsetWidth,
      rightStart: rightPanel.el.offsetWidth
    };
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    this.#el.classList.add("dragging");
  }
  #onDrag(e) {
    if (!this.#dragging)
      return;
    const delta = e.clientX - this.#dragging.startX;
    const leftPanel = this.#panels.get(this.#dragging.leftId);
    const rightPanel = this.#panels.get(this.#dragging.rightId);
    let newLeftWidth = this.#dragging.leftStart + delta;
    let newRightWidth = this.#dragging.rightStart - delta;
    if (newLeftWidth < leftPanel.config.minWidth) {
      newLeftWidth = leftPanel.config.minWidth;
      newRightWidth = this.#dragging.leftStart + this.#dragging.rightStart - newLeftWidth;
    }
    if (newRightWidth < rightPanel.config.minWidth) {
      newRightWidth = rightPanel.config.minWidth;
      newLeftWidth = this.#dragging.leftStart + this.#dragging.rightStart - newRightWidth;
    }
    leftPanel.el.style.width = newLeftWidth + "px";
    rightPanel.el.style.width = newRightWidth + "px";
    leftPanel.el.style.flex = "none";
    rightPanel.el.style.flex = "none";
  }
  #endDrag() {
    if (!this.#dragging)
      return;
    this.#dragging = null;
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
    this.#el.classList.remove("dragging");
    this.#captureCurrentWidths();
    this.#rebalance();
  }
  #rebalance() {
    const visible = this.#visiblePanels();
    if (visible.length > 0) {
      let total = visible.reduce((sum, state) => sum + Math.max(0, state.currentWidth), 0);
      if (total <= 0) {
        const even = 100 / visible.length;
        for (const state of visible)
          state.currentWidth = even;
        total = 100;
      }
      for (const state of visible) {
        const grow = Math.max(0.1, state.currentWidth / total * 100);
        state.el.style.width = "";
        state.el.style.flex = `${grow} 1 0px`;
        state.el.style.minWidth = state.config.minWidth + "px";
      }
    }
    for (const state of this.#panels.values()) {
      if (!state.hidden)
        continue;
      state.el.style.flex = "0 0 0px";
      state.el.style.width = "0px";
      state.el.style.minWidth = "0px";
    }
    this.#updateHandleVisibility();
  }
  #captureCurrentWidths() {
    const visible = this.#visiblePanels();
    if (visible.length === 0)
      return;
    const totalWidth = visible.reduce((sum, state) => sum + state.el.offsetWidth, 0);
    if (totalWidth <= 0)
      return;
    for (const state of visible) {
      state.currentWidth = state.el.offsetWidth / totalWidth * 100;
    }
  }
  #visiblePanels() {
    const out = [];
    for (const id of this.#order) {
      const state = this.#panels.get(id);
      if (!state || state.hidden)
        continue;
      out.push(state);
    }
    return out;
  }
  #updateHandleVisibility() {
    for (let i = 0;i < this.#handles.length; i++) {
      const left = this.#panels.get(this.#order[i]);
      const right = this.#panels.get(this.#order[i + 1]);
      const show = Boolean(left && right && !left.hidden && !right.hidden);
      this.#handles[i].style.display = show ? "" : "none";
    }
  }
  #initialPercent(config) {
    if (config.defaultWidth > 0)
      return config.defaultWidth;
    const containerWidth = Math.max(this.#el.clientWidth, 1);
    const minPercent = config.minWidth / containerWidth * 100;
    return Math.min(40, Math.max(8, minPercent));
  }
  get element() {
    return this.#el;
  }
}

// src/mainview/components/sidebar.ts
var ACTIVITY_DOTS = {
  working: { char: "●", cls: "dot-working" },
  waiting: { char: "◐", cls: "dot-waiting" },
  waiting_for_input: { char: "◐", cls: "dot-waiting-input" },
  idle: { char: "○", cls: "dot-idle" },
  finished: { char: "○", cls: "dot-finished" }
};

class Sidebar {
  #el;
  #listEl;
  #callbacks;
  #activeSessionId = null;
  #openMenuSessionId = null;
  #renamingSessionId = null;
  constructor(container, callbacks) {
    this.#callbacks = callbacks;
    const header = h("div", { class: "ws-header" }, [
      h("span", { class: "ws-header-title" }, ["Workspaces"]),
      h("button", {
        class: "ws-add-btn",
        onclick: () => callbacks.onAddWorkspace(),
        title: "Add workspace"
      }, ["+"])
    ]);
    this.#listEl = h("div", { class: "ws-list" });
    this.#el = h("div", { class: "sidebar" }, [
      header,
      this.#listEl
    ]);
    container.appendChild(this.#el);
  }
  setActiveSession(sessionId) {
    this.#activeSessionId = sessionId;
    for (const item of this.#el.querySelectorAll(".ws-session-item")) {
      item.classList.toggle("active", item.dataset.sessionId === sessionId);
    }
  }
  render(workspaces) {
    if (this.#renamingSessionId || this.#openMenuSessionId)
      return;
    clearChildren(this.#listEl);
    if (workspaces.length === 0) {
      this.#listEl.appendChild(h("div", { class: "ws-empty" }, [
        h("div", { class: "ws-empty-text" }, ["No workspaces"]),
        h("button", {
          class: "ws-empty-btn",
          onclick: () => this.#callbacks.onAddWorkspace()
        }, ["Open Workspace"])
      ]));
      return;
    }
    for (const ws of workspaces) {
      this.#listEl.appendChild(this.#renderWorkspace(ws));
    }
  }
  #renderWorkspace(ws) {
    const chevron = ws.expanded ? "▼" : "▶";
    const sessionCount = ws.sessions.length;
    const activeCount = ws.sessions.filter((s) => s.activity === "working" || s.activity === "waiting_for_input").length;
    const folderHeader = h("div", {
      class: "ws-folder-header",
      onclick: () => this.#callbacks.onToggleWorkspace(ws.path)
    }, [
      h("span", { class: "ws-chevron" }, [chevron]),
      h("span", { class: "ws-folder-name" }, [ws.name]),
      activeCount > 0 ? h("span", { class: "ws-active-badge" }, [String(activeCount)]) : h("span", { class: "ws-count" }, [String(sessionCount)])
    ]);
    const actions = h("div", { class: "ws-folder-actions" }, [
      h("button", {
        class: "ws-action-btn",
        onclick: (e) => {
          e.stopPropagation();
          this.#callbacks.onNewSession(ws.path);
        },
        title: "New session"
      }, ["+"]),
      h("button", {
        class: "ws-action-btn ws-action-remove",
        onclick: (e) => {
          e.stopPropagation();
          this.#callbacks.onRemoveWorkspace(ws.path);
        },
        title: "Remove workspace"
      }, ["×"])
    ]);
    const headerRow = h("div", { class: "ws-folder-row" }, [
      folderHeader,
      actions
    ]);
    const folder = h("div", {
      class: `ws-folder${ws.expanded ? " expanded" : ""}`,
      dataset: { wsPath: ws.path }
    }, [headerRow]);
    if (ws.expanded) {
      const sessionsList = h("div", { class: "ws-sessions" });
      if (ws.sessions.length === 0) {
        sessionsList.appendChild(h("div", { class: "ws-no-sessions" }, ["No sessions"]));
      } else {
        for (const session of ws.sessions) {
          sessionsList.appendChild(this.#renderSession(session, ws.path));
        }
      }
      folder.appendChild(sessionsList);
    }
    return folder;
  }
  #renderSession(session, workspacePath) {
    const dot = ACTIVITY_DOTS[session.activity] ?? ACTIVITY_DOTS.idle;
    const label = session.topic ?? session.prompt?.slice(0, 40) ?? "Claude session";
    const isActive = session.sessionId === this.#activeSessionId;
    const isHistorical = session.activity === "finished" && !session.isAppSpawned;
    const subtitle = isHistorical ? timeAgo(session.updatedAt || session.startedAt) : session.activity.replace(/_/g, " ");
    const sessionItem = h("div", {
      class: `ws-session-item${isActive ? " active" : ""}${isHistorical ? " historical" : ""}`,
      dataset: { sessionId: session.sessionId },
      onclick: (e) => {
        if (e.target.closest(".ws-session-menu-btn, .ws-session-menu")) {
          return;
        }
        this.#callbacks.onSelectSession(session.sessionId, workspacePath);
      }
    }, [
      h("span", { class: `ws-session-dot ${dot.cls}` }, [dot.char]),
      h("div", { class: "ws-session-info" }, [
        h("span", { class: "ws-session-label" }, [label]),
        h("span", { class: "ws-session-activity" }, [subtitle])
      ]),
      h("button", {
        class: "ws-session-menu-btn",
        onclick: (e) => {
          e.stopPropagation();
          this.#toggleSessionMenu(session.sessionId, sessionItem, workspacePath);
        },
        title: "Session options"
      }, ["⋮"])
    ]);
    return sessionItem;
  }
  #toggleSessionMenu(sessionId, sessionItem, workspacePath) {
    const existingMenu = this.#el.querySelector(".ws-session-menu");
    if (existingMenu) {
      existingMenu.remove();
      if (this.#openMenuSessionId === sessionId) {
        this.#openMenuSessionId = null;
        return;
      }
    }
    this.#openMenuSessionId = sessionId;
    const menu = h("div", { class: "ws-session-menu" }, [
      h("button", {
        class: "ws-session-menu-item",
        onclick: () => {
          this.#showRenameDialog(sessionId);
          menu.remove();
          this.#openMenuSessionId = null;
        }
      }, ["Rename"]),
      h("button", {
        class: "ws-session-menu-item ws-session-menu-item-danger",
        onclick: () => {
          this.#callbacks.onDeleteSession(sessionId, workspacePath);
          menu.remove();
          this.#openMenuSessionId = null;
        }
      }, ["Delete"])
    ]);
    sessionItem.appendChild(menu);
    const closeMenu = (e) => {
      if (!menu.contains(e.target)) {
        menu.remove();
        this.#openMenuSessionId = null;
        document.removeEventListener("click", closeMenu);
      }
    };
    setTimeout(() => document.addEventListener("click", closeMenu), 0);
  }
  #showRenameDialog(sessionId) {
    const sessionEl = this.#el.querySelector(`[data-session-id="${sessionId}"]`);
    if (!sessionEl)
      return;
    const labelEl = sessionEl.querySelector(".ws-session-label");
    if (!labelEl)
      return;
    const currentName = labelEl.textContent ?? "";
    const input = document.createElement("input");
    input.type = "text";
    input.className = "ws-session-rename-input";
    input.value = currentName;
    input.placeholder = "Session name";
    this.#renamingSessionId = sessionId;
    const save = () => {
      const newName = input.value.trim();
      if (newName && newName !== currentName) {
        this.#callbacks.onRenameSession(sessionId, newName);
        labelEl.textContent = newName;
      } else {
        labelEl.textContent = currentName;
      }
      labelEl.style.display = "";
      input.remove();
      this.#renamingSessionId = null;
    };
    input.addEventListener("blur", save);
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        save();
      } else if (e.key === "Escape") {
        labelEl.textContent = currentName;
        labelEl.style.display = "";
        input.remove();
        this.#renamingSessionId = null;
      }
    });
    labelEl.style.display = "none";
    labelEl.parentElement?.insertBefore(input, labelEl);
    input.focus();
    input.select();
  }
  get element() {
    return this.#el;
  }
}
function timeAgo(dateStr) {
  if (!dateStr)
    return "finished";
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1)
    return "just now";
  if (mins < 60)
    return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24)
    return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30)
    return `${days}d ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

// src/mainview/components/chat-view.ts
class ChatView {
  #el;
  #headerEl;
  #headerTitleEl;
  #headerWorkspaceEl;
  #headerMenuEl;
  #headerOpenInFinderBtn;
  #messagesEl;
  #composerEl;
  #scrollToBottomBtn;
  #inputEl;
  #inputWrapEl;
  #attachmentStripEl;
  #attachmentListEl;
  #sendBtn;
  #stopBtn;
  #mentionMenuEl;
  #mentionListEl;
  #mentionEmptyEl;
  #contextDetailsEl;
  #contextSummaryValueEl;
  #contextUsedEl;
  #contextTokensEl;
  #contextHintEl;
  #statusEl;
  #permDetailsEl;
  #permLabelEl;
  #permDefaultBtn;
  #permFullBtn;
  #fullAccess = true;
  #callbacks;
  #isWaiting = false;
  #workspacePath = null;
  #mentionVisible = false;
  #mentionSelection = 0;
  #mentionRequestId = 0;
  #mentionSuggestions = [];
  #selectedFiles = [];
  #hasUserScrolledUp = false;
  #isProgrammaticScroll = false;
  #onGlobalPointerDown;
  #onGlobalKeyDown;
  #scrollAnimationFrame = null;
  #composerResizeObserver = null;
  constructor(container, callbacks) {
    this.#callbacks = callbacks;
    this.#onGlobalPointerDown = (event) => {
      const target = event.target;
      if (this.#headerMenuEl.open) {
        if (!(target && this.#headerMenuEl.contains(target))) {
          this.#headerMenuEl.open = false;
        }
      }
      if (this.#permDetailsEl?.open) {
        if (!(target && this.#permDetailsEl.contains(target))) {
          this.#permDetailsEl.open = false;
        }
      }
      if (this.#contextDetailsEl?.open) {
        if (!(target && this.#contextDetailsEl.contains(target))) {
          this.#contextDetailsEl.open = false;
        }
      }
      if (this.#mentionVisible && !(target && this.#inputWrapEl.contains(target))) {
        this.#hideMentionMenu();
      }
    };
    this.#onGlobalKeyDown = (event) => {
      if (event.key !== "Escape")
        return;
      if (this.#headerMenuEl.open)
        this.#headerMenuEl.open = false;
      if (this.#permDetailsEl?.open)
        this.#permDetailsEl.open = false;
      if (this.#contextDetailsEl?.open)
        this.#contextDetailsEl.open = false;
      if (this.#mentionVisible)
        this.#hideMentionMenu();
    };
    this.#headerTitleEl = h("span", { class: "chat-header-title" }, ["New session"]);
    this.#headerWorkspaceEl = h("span", {
      class: "chat-header-workspace",
      hidden: true
    });
    this.#headerOpenInFinderBtn = h("button", {
      class: "chat-header-menu-item",
      onclick: (e) => {
        e.preventDefault();
        const path = this.#workspacePath;
        if (!path)
          return;
        this.#callbacks.onOpenInFinder?.(path);
        this.#headerMenuEl.open = false;
      }
    }, ["Open in Finder"]);
    this.#headerMenuEl = h("details", { class: "chat-header-menu" }, [
      h("summary", { class: "chat-header-menu-btn", title: "More" }, ["⋯"]),
      h("div", { class: "chat-header-menu-popover" }, [
        this.#headerOpenInFinderBtn
      ])
    ]);
    this.#headerEl = h("div", { class: "chat-header" }, [
      h("div", { class: "chat-header-meta" }, [
        this.#headerTitleEl,
        this.#headerWorkspaceEl
      ]),
      this.#headerMenuEl
    ]);
    this.#messagesEl = h("div", { class: "chat-messages" });
    this.#messagesEl.addEventListener("scroll", (event) => {
      this.#onMessagesScroll(event);
    });
    this.#scrollToBottomBtn = h("button", {
      type: "button",
      class: "chat-scroll-bottom-btn",
      hidden: true,
      title: "Scroll to latest message",
      "aria-label": "Scroll to latest message",
      onclick: () => this.#scrollToBottomAnimated(1000)
    }, ["↓"]);
    this.#statusEl = h("div", { class: "chat-status", hidden: true });
    this.#inputEl = document.createElement("textarea");
    this.#inputEl.className = "chat-input";
    this.#inputEl.placeholder = "Ask Claude something...";
    this.#inputEl.rows = 1;
    this.#inputEl.addEventListener("keydown", (e) => this.#onInputKeyDown(e));
    this.#inputEl.addEventListener("input", () => {
      this.#resizeInput();
      this.#updateMentionSuggestions();
    });
    this.#inputEl.addEventListener("click", () => {
      this.#updateMentionSuggestions();
    });
    this.#inputEl.addEventListener("keyup", (event) => {
      if (event.key.startsWith("Arrow") || event.key === "Home" || event.key === "End") {
        this.#updateMentionSuggestions();
      }
    });
    this.#sendBtn = h("button", { class: "chat-send-btn", onclick: () => this.#send() }, ["Send"]);
    this.#stopBtn = h("button", { class: "chat-stop-btn", onclick: () => this.#stop(), hidden: true }, ["Stop"]);
    this.#mentionListEl = h("div", { class: "chat-mention-list" });
    this.#mentionEmptyEl = h("div", {
      class: "chat-mention-empty",
      hidden: true
    }, ["No matching files"]);
    this.#mentionMenuEl = h("div", {
      class: "chat-mention-menu",
      hidden: true
    }, [
      this.#mentionListEl,
      this.#mentionEmptyEl
    ]);
    this.#attachmentListEl = h("div", { class: "chat-attachment-list" });
    this.#attachmentStripEl = h("div", {
      class: "chat-attachment-strip",
      hidden: true
    }, [this.#attachmentListEl]);
    this.#inputWrapEl = h("div", { class: "chat-input-wrap" }, [
      this.#attachmentStripEl,
      this.#inputEl,
      this.#mentionMenuEl
    ]);
    this.#permLabelEl = h("span", { class: "perm-chip-text" }, ["Full access"]);
    this.#permDefaultBtn = h("button", {
      class: "perm-menu-option",
      onclick: (e) => {
        e.preventDefault();
        this.#setPermission(false);
      }
    }, [
      h("span", { class: "perm-menu-title" }, ["Default permissions"]),
      h("span", { class: "perm-menu-check" }, ["✓"])
    ]);
    this.#permFullBtn = h("button", {
      class: "perm-menu-option",
      onclick: (e) => {
        e.preventDefault();
        this.#setPermission(true);
      }
    }, [
      h("span", { class: "perm-menu-title" }, ["Full access"]),
      h("span", { class: "perm-menu-check" }, ["✓"])
    ]);
    this.#permDetailsEl = h("details", { class: "perm-selector" }, [
      h("summary", { class: "perm-chip" }, [
        h("span", { class: "perm-chip-icon" }, ["⛨"]),
        this.#permLabelEl,
        h("span", { class: "perm-chip-caret" }, ["▾"])
      ]),
      h("div", { class: "perm-menu" }, [
        this.#permDefaultBtn,
        this.#permFullBtn
      ])
    ]);
    this.#contextSummaryValueEl = h("span", { class: "context-meter-value" }, ["--"]);
    this.#contextUsedEl = h("div", { class: "context-meter-line" }, ["--"]);
    this.#contextTokensEl = h("div", { class: "context-meter-line" }, [""]);
    this.#contextHintEl = h("div", { class: "context-meter-hint" }, [
      "Claude may automatically compact its context."
    ]);
    this.#contextDetailsEl = h("details", {
      class: "context-meter",
      hidden: true
    }, [
      h("summary", { class: "context-meter-btn", title: "Context window usage" }, [
        h("span", { class: "context-meter-spinner" }),
        this.#contextSummaryValueEl
      ]),
      h("div", { class: "context-meter-popover" }, [
        h("div", { class: "context-meter-title" }, ["Context window"]),
        this.#contextUsedEl,
        this.#contextTokensEl,
        this.#contextHintEl
      ])
    ]);
    const toggleRow = h("div", { class: "chat-perm-toggle-row" }, [
      this.#permDetailsEl,
      h("div", { class: "chat-footer-spacer" }),
      this.#contextDetailsEl
    ]);
    this.#setPermission(true);
    const inputRow = h("div", { class: "chat-input-row" }, [
      this.#inputWrapEl,
      this.#stopBtn,
      this.#sendBtn
    ]);
    const composerEl = h("div", { class: "chat-composer" }, [
      this.#scrollToBottomBtn,
      this.#statusEl,
      inputRow,
      toggleRow
    ]);
    this.#composerEl = composerEl;
    this.#el = h("div", { class: "chat-view" }, [
      this.#headerEl,
      this.#messagesEl,
      composerEl
    ]);
    container.appendChild(this.#el);
    this.#syncComposerInset();
    if (typeof ResizeObserver !== "undefined") {
      this.#composerResizeObserver = new ResizeObserver(() => {
        this.#syncComposerInset();
      });
      this.#composerResizeObserver.observe(this.#composerEl);
    }
    this.setHeader("New session", null);
    this.#updateScrollToBottomButton();
    document.addEventListener("pointerdown", this.#onGlobalPointerDown, true);
    document.addEventListener("keydown", this.#onGlobalKeyDown, true);
  }
  renderTranscript(messages) {
    clearChildren(this.#messagesEl);
    this.#hasUserScrolledUp = false;
    this.#isWaiting = false;
    this.#hideStatus();
    for (const msg of messages) {
      this.#appendTranscriptMessage(msg);
    }
    this.#scrollToBottom();
  }
  appendStreamEvent(event) {
    const ev = event;
    if (ev.type === "system") {
      if (ev.subtype === "init") {
        this.#showStatus("Claude is thinking...");
        this.#isWaiting = true;
      }
      return;
    }
    if (ev.type === "assistant") {
      this.#hideStatus();
      this.#isWaiting = true;
      const content = ev.message?.content;
      if (!content || !Array.isArray(content))
        return;
      for (const block of content) {
        this.#renderContentBlock(block);
      }
      const hasToolUse = content.some((b) => b.type === "tool_use");
      if (hasToolUse) {
        this.#showStatus("Running tool...");
      } else {
        this.#hideStatus();
        this.#isWaiting = false;
        this.#hideStopButton();
      }
      this.#scrollToBottom();
      return;
    }
    if (ev.type === "user") {
      const content = ev.message?.content;
      if (!content || !Array.isArray(content))
        return;
      let hasToolResult = false;
      for (const block of content) {
        if (block.type === "tool_result") {
          hasToolResult = true;
          this.#hideStatus();
          const output = typeof block.content === "string" ? block.content : JSON.stringify(block.content ?? "");
          this.#appendToolResult(block.tool_use_id ?? "", output, block.is_error === true);
        }
      }
      if (hasToolResult) {
        this.#showStatus("Claude is thinking...");
      }
      this.#scrollToBottom();
      return;
    }
    if (ev.type === "result") {
      this.#hideStatus();
      this.#isWaiting = false;
      this.#hideStopButton();
      const turns = ev.num_turns;
      if (typeof turns === "number") {
        this.#appendSystemInfo(`Done — ${turns} turn${turns !== 1 ? "s" : ""}`);
      } else {
        this.#appendSystemInfo("Done");
      }
      return;
    }
    if (ev.type === "error") {
      this.#hideStatus();
      this.#isWaiting = false;
      this.#hideStopButton();
      const msg = ev.error?.message ?? "Unknown error";
      this.#appendError(msg);
      return;
    }
    console.log("[chat-view] Unhandled event:", ev.type, ev);
  }
  appendUserMessage(text, selectedFiles = []) {
    const bubble = h("div", { class: "chat-bubble user" });
    bubble.innerHTML = this.#renderUserMessageHtml(text, selectedFiles);
    this.#messagesEl.appendChild(bubble);
    this.#showStatus("Starting Claude...");
    this.#isWaiting = true;
    this.#scrollToBottom();
  }
  clear() {
    clearChildren(this.#messagesEl);
    this.#cancelScrollAnimation();
    this.#hasUserScrolledUp = false;
    this.#updateScrollToBottomButton();
    this.#isWaiting = false;
    this.#hideStatus();
    this.#hideMentionMenu();
    this.#clearSelectedFiles();
  }
  setHeader(sessionTitle, workspacePath) {
    const title = sessionTitle.trim() || "New session";
    this.#headerTitleEl.textContent = title;
    this.#workspacePath = workspacePath;
    if (workspacePath) {
      const name = basename(workspacePath);
      this.#headerWorkspaceEl.textContent = name;
      this.#headerWorkspaceEl.title = workspacePath;
      this.#headerWorkspaceEl.hidden = false;
      this.#headerOpenInFinderBtn.disabled = false;
    } else {
      this.#headerWorkspaceEl.textContent = "";
      this.#headerWorkspaceEl.removeAttribute("title");
      this.#headerWorkspaceEl.hidden = true;
      this.#headerOpenInFinderBtn.disabled = true;
      this.#headerMenuEl.open = false;
    }
  }
  setContextUsage(contextPercentage, model, activity, promptTokens = null) {
    const normalized = normalizePercent(contextPercentage);
    const hasAnySignal = normalized !== null || promptTokens !== null || model !== null || activity !== null;
    if (!hasAnySignal) {
      this.#contextDetailsEl.hidden = true;
      this.#contextDetailsEl.open = false;
      return;
    }
    this.#contextDetailsEl.hidden = false;
    const isBusy = activity === "working" || activity === "waiting";
    this.#contextDetailsEl.classList.toggle("busy", isBusy);
    const windowSize = inferContextWindow(model);
    let usedPct = normalized;
    if (usedPct === null && windowSize && promptTokens !== null) {
      usedPct = Math.min(100, promptTokens / windowSize * 100);
    }
    if (usedPct === null) {
      this.#contextSummaryValueEl.textContent = "--";
      this.#contextUsedEl.textContent = "Usage is being tracked";
      this.#contextTokensEl.textContent = model ? `Model: ${model}` : "No context usage data yet";
      return;
    }
    const roundedPct = Math.round(usedPct);
    const leftPct = Math.max(0, 100 - roundedPct);
    this.#contextSummaryValueEl.textContent = `${roundedPct}%`;
    this.#contextUsedEl.textContent = `${roundedPct}% used (${leftPct}% left)`;
    if (windowSize) {
      const usedTokens = promptTokens !== null ? Math.round(promptTokens) : Math.round(windowSize * roundedPct / 100);
      this.#contextTokensEl.textContent = `Approx. ${formatTokens(usedTokens)} / ${formatTokens(windowSize)} tokens used`;
    } else if (model) {
      this.#contextTokensEl.textContent = `Model: ${model}`;
    } else {
      this.#contextTokensEl.textContent = "Live estimate from Claude hooks";
    }
  }
  showToolApproval(req, respond) {
    const summary = summarizeToolInput(req.toolName, req.toolInput);
    const dialog = h("div", { class: "tool-approval-dialog" }, [
      h("div", { class: "tool-approval-header" }, [
        h("span", { class: "tool-icon" }, [toolIcon(req.toolName)]),
        h("span", { class: "tool-approval-name" }, [req.toolName]),
        summary ? h("span", { class: "tool-approval-summary" }, [summary]) : null
      ].filter(Boolean))
    ]);
    const details = formatToolDetails(req.toolName, req.toolInput);
    if (details) {
      dialog.appendChild(h("pre", { class: "tool-approval-details" }, [details]));
    }
    const actions = h("div", { class: "tool-approval-actions" }, [
      h("button", {
        class: "tool-perm-btn tool-perm-allow",
        onclick: () => {
          respond(true);
          dialog.classList.add("responded", "approved");
          actions.innerHTML = '<span class="tool-approval-status">Allowed</span>';
          this.#showStatus(`Running ${req.toolName}...`);
        }
      }, ["Allow"]),
      h("button", {
        class: "tool-perm-btn tool-perm-deny",
        onclick: () => {
          respond(false);
          dialog.classList.add("responded", "denied");
          actions.innerHTML = '<span class="tool-approval-status denied">Denied</span>';
          this.#hideStatus();
        }
      }, ["Deny"])
    ]);
    dialog.appendChild(actions);
    this.#messagesEl.appendChild(dialog);
    this.#showStatus(`Waiting for approval: ${req.toolName}`);
    this.#scrollToBottom();
  }
  focus() {
    this.#inputEl.focus();
  }
  #onInputKeyDown(event) {
    if (event.key === "Backspace" && this.#inputEl.value.length === 0 && this.#selectedFiles.length > 0) {
      event.preventDefault();
      this.#selectedFiles.pop();
      this.#renderSelectedFiles();
      return;
    }
    if (this.#mentionVisible) {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        this.#moveMentionSelection(1);
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        this.#moveMentionSelection(-1);
        return;
      }
      if ((event.key === "Enter" && !event.shiftKey || event.key === "Tab") && this.#mentionSuggestions.length > 0) {
        event.preventDefault();
        this.#applyMentionSelection();
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        this.#hideMentionMenu();
        return;
      }
    }
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      this.#send();
    }
  }
  #send() {
    if (this.#isWaiting)
      return;
    const text = this.#inputEl.value.trim();
    const selectedFiles = this.#selectedFiles.slice();
    if (!text && selectedFiles.length === 0)
      return;
    this.#hideMentionMenu();
    this.#inputEl.value = "";
    this.#resizeInput();
    const fullAccess = this.#fullAccess;
    this.appendUserMessage(text, selectedFiles);
    this.#callbacks.onSendPrompt(text, fullAccess, selectedFiles);
    this.#clearSelectedFiles();
    this.#showStopButton();
  }
  #stop() {
    this.#callbacks.onStopSession?.();
    this.#hideStopButton();
    this.#hideStatus();
    this.#isWaiting = false;
  }
  #showStopButton() {
    this.#sendBtn.hidden = true;
    this.#stopBtn.hidden = false;
  }
  #hideStopButton() {
    this.#stopBtn.hidden = true;
    this.#sendBtn.hidden = false;
  }
  #resizeInput() {
    this.#inputEl.style.height = "auto";
    this.#inputEl.style.height = Math.min(this.#inputEl.scrollHeight, 150) + "px";
  }
  async#updateMentionSuggestions() {
    const provider = this.#callbacks.onSearchFiles;
    if (!provider) {
      this.#hideMentionMenu();
      return;
    }
    const cursor = this.#inputEl.selectionStart ?? this.#inputEl.value.length;
    const token = findMentionToken(this.#inputEl.value, cursor);
    if (!token) {
      this.#hideMentionMenu();
      return;
    }
    const requestId = ++this.#mentionRequestId;
    let suggestions = [];
    try {
      suggestions = await provider(token.query);
    } catch (error) {
      console.error("Failed to load @file suggestions:", error);
      this.#hideMentionMenu();
      return;
    }
    if (requestId !== this.#mentionRequestId)
      return;
    const latestCursor = this.#inputEl.selectionStart ?? this.#inputEl.value.length;
    const latestToken = findMentionToken(this.#inputEl.value, latestCursor);
    if (!latestToken) {
      this.#hideMentionMenu();
      return;
    }
    this.#mentionSuggestions = suggestions.slice(0, 30);
    if (this.#mentionSuggestions.length === 0) {
      clearChildren(this.#mentionListEl);
      this.#mentionEmptyEl.hidden = false;
      this.#mentionMenuEl.hidden = false;
      this.#mentionVisible = true;
      return;
    }
    this.#mentionSelection = Math.min(this.#mentionSelection, this.#mentionSuggestions.length - 1);
    this.#mentionEmptyEl.hidden = true;
    this.#mentionMenuEl.hidden = false;
    this.#mentionVisible = true;
    this.#renderMentionSuggestions();
  }
  #moveMentionSelection(delta) {
    if (!this.#mentionVisible || this.#mentionSuggestions.length === 0)
      return;
    const max = this.#mentionSuggestions.length - 1;
    this.#mentionSelection = clamp(this.#mentionSelection + delta, 0, max);
    this.#renderMentionSuggestions();
  }
  #renderMentionSuggestions() {
    clearChildren(this.#mentionListEl);
    this.#mentionSuggestions.forEach((path, index) => {
      const { name, dir } = splitPath(path);
      const option = h("button", {
        type: "button",
        class: `chat-mention-option${index === this.#mentionSelection ? " active" : ""}`
      }, [
        h("span", { class: "chat-mention-icon" }, [fileIcon(name)]),
        h("span", { class: "chat-mention-name" }, [name]),
        h("span", { class: "chat-mention-dir" }, [dir || "./"])
      ]);
      option.addEventListener("mousedown", (event) => {
        event.preventDefault();
      });
      option.addEventListener("click", (event) => {
        event.preventDefault();
        this.#mentionSelection = index;
        this.#applyMentionSelection();
      });
      this.#mentionListEl.appendChild(option);
    });
    const active = this.#mentionListEl.querySelector(".chat-mention-option.active");
    active?.scrollIntoView({ block: "nearest" });
  }
  #applyMentionSelection() {
    if (this.#mentionSuggestions.length === 0) {
      this.#hideMentionMenu();
      return;
    }
    const selected = this.#mentionSuggestions[this.#mentionSelection];
    if (!selected) {
      this.#hideMentionMenu();
      return;
    }
    const value = this.#inputEl.value;
    const cursor = this.#inputEl.selectionStart ?? value.length;
    const token = findMentionToken(value, cursor);
    if (!token) {
      this.#hideMentionMenu();
      return;
    }
    const before = value.slice(0, token.start);
    const after = value.slice(token.end);
    const needsSingleSpace = before.length > 0 && !/\s$/.test(before) && !/^\s/.test(after);
    const inserted = `${before}${needsSingleSpace ? " " : ""}${after}`;
    this.#inputEl.value = inserted;
    const nextCursor = before.length + (needsSingleSpace ? 1 : 0);
    this.#inputEl.setSelectionRange(nextCursor, nextCursor);
    this.#addSelectedFile(selected);
    this.#resizeInput();
    this.#hideMentionMenu();
    this.#inputEl.focus();
  }
  #hideMentionMenu() {
    this.#mentionVisible = false;
    this.#mentionSuggestions = [];
    this.#mentionSelection = 0;
    this.#mentionMenuEl.hidden = true;
    this.#mentionEmptyEl.hidden = true;
    clearChildren(this.#mentionListEl);
  }
  #addSelectedFile(path) {
    if (this.#selectedFiles.includes(path))
      return;
    this.#selectedFiles.push(path);
    this.#renderSelectedFiles();
  }
  #removeSelectedFile(path) {
    this.#selectedFiles = this.#selectedFiles.filter((item) => item !== path);
    this.#renderSelectedFiles();
  }
  #clearSelectedFiles() {
    this.#selectedFiles = [];
    this.#renderSelectedFiles();
  }
  #renderSelectedFiles() {
    clearChildren(this.#attachmentListEl);
    this.#attachmentStripEl.hidden = this.#selectedFiles.length === 0;
    if (this.#selectedFiles.length === 0)
      return;
    this.#selectedFiles.forEach((path) => {
      const chip = h("span", { class: "chat-attachment-chip" }, [
        h("span", { class: "chat-attachment-chip-icon" }, [fileIcon(basename(path))]),
        h("span", { class: "chat-attachment-chip-label" }, [basename(path)]),
        h("button", {
          type: "button",
          class: "chat-attachment-chip-remove",
          title: "Remove file",
          onclick: (event) => {
            event.preventDefault();
            this.#removeSelectedFile(path);
            this.#inputEl.focus();
          }
        }, ["×"])
      ]);
      this.#attachmentListEl.appendChild(chip);
    });
  }
  #renderContentBlock(block) {
    if (block.type === "text") {
      const bubble = h("div", { class: "chat-bubble assistant" });
      bubble.innerHTML = renderMarkdown(block.text);
      this.#messagesEl.appendChild(bubble);
    } else if (block.type === "tool_use") {
      if (block.name === "AskUserQuestion") {
        this.#renderAskUserQuestion(block);
        return;
      }
      const summary = summarizeToolInput(block.name, block.input);
      const details = formatToolDetails(block.name, block.input);
      const detailsPanel = h("details", { class: "tool-details" }, [
        h("summary", { class: "tool-header" }, [
          block.name,
          summary ? ` ${summary}` : ""
        ]),
        details ? h("div", { class: "tool-input" }) : null
      ].filter(Boolean));
      detailsPanel.open = shouldExpandTool(block.name);
      const toolEvent = h("div", { class: "chat-tool-event" }, [
        detailsPanel
      ]);
      if (details) {
        const detailsEl = qs(".tool-input", toolEvent);
        if (detailsEl) {
          detailsEl.innerHTML = renderToolContent(details);
        }
      }
      this.#messagesEl.appendChild(toolEvent);
      this.#showStatus(`Running ${block.name}...`);
    } else if (block.type === "tool_result") {
      this.#hideStatus();
      return;
    }
  }
  #renderAskUserQuestion(block) {
    const input = block.input;
    const questions = input?.questions ?? [];
    const dialog = h("div", { class: "chat-permission-dialog" });
    for (const q of questions) {
      const questionEl = h("div", { class: "perm-question" });
      if (q.header) {
        questionEl.appendChild(h("div", { class: "perm-header" }, [q.header]));
      }
      questionEl.appendChild(h("div", { class: "perm-text" }, [q.question ?? ""]));
      if (q.options && Array.isArray(q.options)) {
        const optionsEl = h("div", { class: "perm-options" });
        for (const opt of q.options) {
          const btn = h("button", {
            class: "perm-option-btn",
            onclick: () => {
              const selectedFiles = this.#selectedFiles.slice();
              this.#callbacks.onSendPrompt(opt.label, this.#fullAccess, selectedFiles);
              this.#clearSelectedFiles();
              dialog.querySelectorAll("button").forEach((b) => b.disabled = true);
              dialog.classList.add("responded");
            }
          }, [opt.label]);
          if (opt.description) {
            btn.title = opt.description;
          }
          optionsEl.appendChild(btn);
        }
        questionEl.appendChild(optionsEl);
      }
      dialog.appendChild(questionEl);
    }
    this.#messagesEl.appendChild(dialog);
    this.#hideStatus();
    this.#isWaiting = false;
  }
  #appendToolResult(_toolUseId, _output, _isError) {
    return;
  }
  #appendTranscriptMessage(msg) {
    const isUser = msg.role === "user";
    if (msg.toolName && !isUser) {
      const summary = summarizeToolInput(msg.toolName, msg.toolInput);
      const details = formatToolDetails(msg.toolName, msg.toolInput ?? {});
      const detailsPanel = h("details", { class: "tool-details" }, [
        h("summary", { class: "tool-header" }, [
          msg.toolName,
          summary ? ` ${summary}` : ""
        ]),
        details ? h("div", { class: "tool-input" }) : null
      ].filter(Boolean));
      detailsPanel.open = shouldExpandTool(msg.toolName);
      const toolEvent = h("div", { class: "chat-tool-event" }, [
        detailsPanel
      ]);
      if (details) {
        const detailsEl = qs(".tool-input", toolEvent);
        if (detailsEl) {
          detailsEl.innerHTML = renderToolContent(details);
        }
      }
      this.#messagesEl.appendChild(toolEvent);
      return;
    }
    const bubble = h("div", {
      class: `chat-bubble ${isUser ? "user" : "assistant"}`
    });
    if (isUser) {
      bubble.innerHTML = this.#renderUserMessageHtml(msg.content, []);
    } else {
      bubble.innerHTML = renderMarkdown(msg.content);
    }
    this.#messagesEl.appendChild(bubble);
  }
  #appendSystemInfo(text) {
    const el = h("div", { class: "chat-system-info" }, [text]);
    this.#messagesEl.appendChild(el);
    this.#scrollToBottom();
  }
  #appendError(text) {
    const el = h("div", { class: "chat-error" }, [text]);
    this.#messagesEl.appendChild(el);
    this.#scrollToBottom();
  }
  #showStatus(text) {
    this.#statusEl.textContent = text;
    this.#statusEl.hidden = false;
    this.#syncComposerInset();
  }
  #hideStatus() {
    this.#statusEl.hidden = true;
    this.#syncComposerInset();
  }
  #scrollToBottom() {
    this.#cancelScrollAnimation();
    requestAnimationFrame(() => {
      this.#isProgrammaticScroll = true;
      this.#messagesEl.scrollTop = this.#messagesEl.scrollHeight;
      this.#updateScrollToBottomButton();
      requestAnimationFrame(() => {
        this.#isProgrammaticScroll = false;
      });
    });
  }
  #scrollToBottomAnimated(durationMs) {
    this.#cancelScrollAnimation();
    const maxScrollTop = this.#messagesEl.scrollHeight - this.#messagesEl.clientHeight;
    const startTop = this.#messagesEl.scrollTop;
    if (maxScrollTop <= startTop) {
      this.#messagesEl.scrollTop = this.#messagesEl.scrollHeight;
      this.#updateScrollToBottomButton();
      return;
    }
    let startTime = 0;
    this.#isProgrammaticScroll = true;
    const step = (time) => {
      if (startTime === 0)
        startTime = time;
      const elapsed = time - startTime;
      const progress = Math.min(1, elapsed / durationMs);
      const easedProgress = easeInOutCubic(progress);
      const currentMaxScrollTop = this.#messagesEl.scrollHeight - this.#messagesEl.clientHeight;
      this.#messagesEl.scrollTop = startTop + (currentMaxScrollTop - startTop) * easedProgress;
      this.#updateScrollToBottomButton();
      if (progress < 1) {
        this.#scrollAnimationFrame = requestAnimationFrame(step);
        return;
      }
      this.#messagesEl.scrollTop = this.#messagesEl.scrollHeight;
      this.#hasUserScrolledUp = false;
      this.#updateScrollToBottomButton();
      this.#scrollAnimationFrame = null;
      requestAnimationFrame(() => {
        this.#isProgrammaticScroll = false;
      });
    };
    this.#scrollAnimationFrame = requestAnimationFrame(step);
  }
  #cancelScrollAnimation() {
    if (this.#scrollAnimationFrame === null)
      return;
    cancelAnimationFrame(this.#scrollAnimationFrame);
    this.#scrollAnimationFrame = null;
  }
  #onMessagesScroll(event) {
    if (this.#isProgrammaticScroll) {
      this.#updateScrollToBottomButton();
      return;
    }
    const maxScrollTop = this.#messagesEl.scrollHeight - this.#messagesEl.clientHeight;
    if (maxScrollTop <= 0) {
      this.#hasUserScrolledUp = false;
      this.#updateScrollToBottomButton();
      return;
    }
    const distanceFromBottom = maxScrollTop - this.#messagesEl.scrollTop;
    const threshold = Math.max(2, maxScrollTop * 0.05);
    if (distanceFromBottom <= threshold) {
      this.#hasUserScrolledUp = false;
    } else if (event.isTrusted) {
      this.#hasUserScrolledUp = true;
    }
    this.#updateScrollToBottomButton();
  }
  #updateScrollToBottomButton() {
    const maxScrollTop = this.#messagesEl.scrollHeight - this.#messagesEl.clientHeight;
    if (maxScrollTop <= 0) {
      this.#scrollToBottomBtn.hidden = true;
      return;
    }
    const distanceFromBottom = maxScrollTop - this.#messagesEl.scrollTop;
    const threshold = Math.max(2, maxScrollTop * 0.05);
    this.#scrollToBottomBtn.hidden = distanceFromBottom <= threshold || !this.#hasUserScrolledUp;
  }
  #setPermission(fullAccess) {
    this.#fullAccess = fullAccess;
    this.#permLabelEl.textContent = fullAccess ? "Full access" : "Default permissions";
    this.#permDetailsEl.classList.toggle("full-access", fullAccess);
    this.#permDefaultBtn.classList.toggle("selected", !fullAccess);
    this.#permFullBtn.classList.toggle("selected", fullAccess);
    this.#permDetailsEl.open = false;
  }
  #syncComposerInset() {
    const composerHeight = this.#composerEl.offsetHeight;
    if (composerHeight <= 0)
      return;
    const clearance = Math.max(170, composerHeight + 26);
    this.#messagesEl.style.paddingBottom = `${clearance}px`;
    this.#messagesEl.style.scrollPaddingBottom = `${clearance}px`;
  }
  #renderUserMessageHtml(rawText, selectedFiles) {
    const parsed = parseAttachedFilesDirective(rawText);
    const files = uniqueFiles([...selectedFiles, ...parsed.files]);
    const cleanedText = parsed.text.trim();
    const parts = [];
    if (files.length > 0) {
      const fileTags = files.map((path) => `<span class="chat-file-chip-inline">${escapeHtml(basename(path))}</span>`).join(" ");
      parts.push(`<div class="chat-user-files"><span class="chat-user-files-label">Attached files:</span>${fileTags}</div>`);
    }
    if (cleanedText) {
      parts.push(escapeHtml(cleanedText).replace(/\n/g, "<br>"));
    }
    return parts.join("");
  }
  get element() {
    return this.#el;
  }
}
function toolIcon(toolName) {
  const icons = {
    Bash: "▸",
    Edit: "✎",
    Write: "✎",
    Read: "□",
    Glob: "⌕",
    Grep: "⌕",
    Task: "⮞",
    WebFetch: "↗"
  };
  return icons[toolName] ?? "•";
}
function findMentionToken(text, cursor) {
  const clampedCursor = clamp(cursor, 0, text.length);
  const beforeCursor = text.slice(0, clampedCursor);
  const atIndex = beforeCursor.lastIndexOf("@");
  if (atIndex < 0)
    return null;
  if (atIndex > 0 && !/\s/.test(text[atIndex - 1])) {
    return null;
  }
  const token = text.slice(atIndex + 1, clampedCursor);
  if (/\s/.test(token))
    return null;
  return {
    start: atIndex,
    end: clampedCursor,
    query: token
  };
}
function splitPath(path) {
  const parts = path.split("/");
  const name = parts.pop() || path;
  return {
    name,
    dir: parts.join("/")
  };
}
function fileIcon(name) {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  if (ext === "ts" || ext === "tsx")
    return "TS";
  if (ext === "js" || ext === "jsx" || ext === "mjs" || ext === "cjs")
    return "JS";
  if (ext === "json" || ext === "yaml" || ext === "yml" || ext === "toml")
    return "{}";
  if (ext === "md")
    return "MD";
  return "·";
}
function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}
function easeInOutCubic(progress) {
  return progress < 0.5 ? 4 * progress * progress * progress : 1 - Math.pow(-2 * progress + 2, 3) / 2;
}
function normalizePercent(value) {
  if (value === null || value === undefined)
    return null;
  const number = Number(value);
  if (!Number.isFinite(number))
    return null;
  return clamp(number, 0, 100);
}
function inferContextWindow(model) {
  if (!model)
    return null;
  const normalized = model.toLowerCase();
  if (normalized.includes("claude") || normalized.includes("sonnet") || normalized.includes("opus") || normalized.includes("haiku")) {
    return 200000;
  }
  return null;
}
function formatTokens(value) {
  if (value >= 1e6) {
    return `${(value / 1e6).toFixed(1)}M`;
  }
  if (value >= 1000) {
    return `${Math.round(value / 1000)}k`;
  }
  return `${Math.round(value)}`;
}
function parseAttachedFilesDirective(text) {
  const files = [];
  const directivePattern = /<attached_files>\s*([\s\S]*?)<\/attached_files>/gi;
  const cleaned = text.replace(directivePattern, (_match, block) => {
    for (const rawLine of String(block).split(`
`)) {
      const line = rawLine.trim();
      if (!line.startsWith("-"))
        continue;
      const parsed = parseAttachedFileLine(line);
      if (parsed)
        files.push(parsed);
    }
    return "";
  });
  return {
    text: cleaned.replace(/\n{3,}/g, `

`),
    files: uniqueFiles(files)
  };
}
function parseAttachedFileLine(line) {
  const match = line.match(/^-+\s+(.+?)(?:\s+\(workspace:\s*(.+?)\))?$/);
  if (!match)
    return null;
  const workspacePath = match[2]?.trim();
  if (workspacePath)
    return workspacePath;
  const absolutePath = match[1]?.trim();
  if (!absolutePath)
    return null;
  return basename(absolutePath);
}
function uniqueFiles(files) {
  const out = [];
  const seen = new Set;
  for (const file of files) {
    const normalized = file.trim();
    if (!normalized || seen.has(normalized))
      continue;
    seen.add(normalized);
    out.push(normalized);
  }
  return out;
}
function summarizeToolInput(toolName, input) {
  if (!input)
    return "";
  switch (toolName) {
    case "Bash":
      return String(input.command ?? "").slice(0, 80);
    case "Edit":
    case "Write":
    case "Read":
      return basename(String(input.file_path ?? ""));
    case "Glob":
      return String(input.pattern ?? "");
    case "Grep":
      return String(input.pattern ?? "");
    case "WebFetch":
      return String(input.url ?? "");
    case "Task":
      return String(input.description ?? input.prompt ?? "").slice(0, 60);
    default:
      return "";
  }
}
function basename(filePath) {
  return filePath.split("/").pop() ?? filePath;
}
function escapeHtml(text) {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function formatToolDetails(toolName, input) {
  switch (toolName) {
    case "Bash":
      return `\`\`\`bash
${String(input.command ?? "")}
\`\`\``;
    case "Write": {
      const filePath = String(input.file_path ?? "");
      const content = String(input.content ?? "").slice(0, 4000);
      const added = content.split(`
`).filter((line) => line.length > 0).map((line) => `+${line}`).join(`
`);
      return `File: ${filePath}

\`\`\`diff
${added || "+(empty file)"}
\`\`\``;
    }
    case "Edit": {
      const filePath = String(input.file_path ?? "");
      const oldText = String(input.old_string ?? "").slice(0, 2000);
      const newText = String(input.new_string ?? "").slice(0, 2000);
      const diff = toUnifiedDiff(oldText, newText);
      return `File: ${filePath}

\`\`\`diff
${diff}
\`\`\``;
    }
    case "Read":
      return String(input.file_path ?? "");
    default:
      return null;
  }
}
function renderMarkdown(text) {
  const normalized = escapeHtml(text).replace(/\r\n?/g, `
`);
  const codeBlocks = [];
  const withCodePlaceholders = normalized.replace(/```([^\n`]*)\n?([\s\S]*?)```/g, (_match, lang, code) => {
    const codeText = String(code).replace(/\n$/, "");
    const language = String(lang ?? "").trim().toLowerCase();
    const index = codeBlocks.push(language === "diff" ? renderInlineDiff(codeText) : `<pre class="code-block"><code>${codeText}</code></pre>`) - 1;
    return `@@CODE_BLOCK_${index}@@`;
  });
  const renderedText = withCodePlaceholders.replace(/`([^`\n]+)`/g, '<code class="inline-code">$1</code>').replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>").replace(/\*(.+?)\*/g, "<em>$1</em>").replace(/\n/g, "<br>");
  return renderedText.replace(/@@CODE_BLOCK_(\d+)@@/g, (_match, idx) => {
    const block = codeBlocks[Number(idx)];
    return block ?? "";
  });
}
function renderToolContent(text) {
  const trimmed = text.trim();
  if (!trimmed)
    return "";
  if (trimmed.includes("```")) {
    return renderMarkdown(trimmed);
  }
  if (trimmed.includes(`
`)) {
    return `<pre class="code-block"><code>${escapeHtml(trimmed)}</code></pre>`;
  }
  return renderMarkdown(trimmed);
}
function toUnifiedDiff(oldText, newText) {
  const oldLines = oldText.split(`
`);
  const newLines = newText.split(`
`);
  const n = oldLines.length;
  const m = newLines.length;
  const dp = Array.from({ length: n + 1 }, () => Array.from({ length: m + 1 }, () => 0));
  for (let i2 = n - 1;i2 >= 0; i2--) {
    for (let j2 = m - 1;j2 >= 0; j2--) {
      if (oldLines[i2] === newLines[j2]) {
        dp[i2][j2] = dp[i2 + 1][j2 + 1] + 1;
      } else {
        dp[i2][j2] = Math.max(dp[i2 + 1][j2], dp[i2][j2 + 1]);
      }
    }
  }
  let i = 0;
  let j = 0;
  const out = [];
  while (i < n && j < m) {
    if (oldLines[i] === newLines[j]) {
      out.push(` ${oldLines[i]}`);
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      out.push(`-${oldLines[i]}`);
      i++;
    } else {
      out.push(`+${newLines[j]}`);
      j++;
    }
  }
  while (i < n)
    out.push(`-${oldLines[i++]}`);
  while (j < m)
    out.push(`+${newLines[j++]}`);
  return out.length > 0 ? out.join(`
`) : "(no textual changes)";
}
function renderInlineDiff(diffText) {
  const rows = [];
  const lines = diffText.split(`
`);
  let oldLine = 1;
  let newLine = 1;
  for (const line of lines) {
    if (line.startsWith("@@")) {
      const m = line.match(/^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
      if (m) {
        oldLine = Number(m[1]);
        newLine = Number(m[2]);
      }
      rows.push(`<tr class="diff-hunk-header"><td class="line-no"></td><td class="line-content hunk-label">${escapeHtml(line)}</td></tr>`);
      continue;
    }
    let rowClass = "diff-context";
    if (line.startsWith("+")) {
      rowClass = "diff-add";
    } else if (line.startsWith("-")) {
      rowClass = "diff-delete";
    }
    let lineNo = "";
    if (line.startsWith("+")) {
      lineNo = String(newLine++);
    } else if (line.startsWith("-")) {
      lineNo = String(oldLine++);
    } else {
      lineNo = String(newLine);
      oldLine++;
      newLine++;
    }
    rows.push(`<tr class="diff-line ${rowClass}"><td class="line-no">${lineNo}</td><td class="line-content">${escapeHtml(line)}</td></tr>`);
  }
  return `<div class="chat-inline-diff"><table class="diff-table unified"><tbody>${rows.join("")}</tbody></table></div>`;
}
function shouldExpandTool(toolName) {
  const normalized = toolName.trim().toLowerCase();
  return normalized === "write" || normalized === "edit" || normalized === "multiedit" || normalized === "remove" || normalized === "delete";
}

// src/mainview/components/diff-view.ts
var import_prismjs = __toESM(require_prism(), 1);

// node_modules/prismjs/components/prism-clike.js
Prism.languages.clike = {
  comment: [
    {
      pattern: /(^|[^\\])\/\*[\s\S]*?(?:\*\/|$)/,
      lookbehind: true,
      greedy: true
    },
    {
      pattern: /(^|[^\\:])\/\/.*/,
      lookbehind: true,
      greedy: true
    }
  ],
  string: {
    pattern: /(["'])(?:\\(?:\r\n|[\s\S])|(?!\1)[^\\\r\n])*\1/,
    greedy: true
  },
  "class-name": {
    pattern: /(\b(?:class|extends|implements|instanceof|interface|new|trait)\s+|\bcatch\s+\()[\w.\\]+/i,
    lookbehind: true,
    inside: {
      punctuation: /[.\\]/
    }
  },
  keyword: /\b(?:break|catch|continue|do|else|finally|for|function|if|in|instanceof|new|null|return|throw|try|while)\b/,
  boolean: /\b(?:false|true)\b/,
  function: /\b\w+(?=\()/,
  number: /\b0x[\da-f]+\b|(?:\b\d+(?:\.\d*)?|\B\.\d+)(?:e[+-]?\d+)?/i,
  operator: /[<>]=?|[!=]=?=?|--?|\+\+?|&&?|\|\|?|[?*/~^%]/,
  punctuation: /[{}[\];(),.:]/
};

// node_modules/prismjs/components/prism-javascript.js
Prism.languages.javascript = Prism.languages.extend("clike", {
  "class-name": [
    Prism.languages.clike["class-name"],
    {
      pattern: /(^|[^$\w\xA0-\uFFFF])(?!\s)[_$A-Z\xA0-\uFFFF](?:(?!\s)[$\w\xA0-\uFFFF])*(?=\.(?:constructor|prototype))/,
      lookbehind: true
    }
  ],
  keyword: [
    {
      pattern: /((?:^|\})\s*)catch\b/,
      lookbehind: true
    },
    {
      pattern: /(^|[^.]|\.\.\.\s*)\b(?:as|assert(?=\s*\{)|async(?=\s*(?:function\b|\(|[$\w\xA0-\uFFFF]|$))|await|break|case|class|const|continue|debugger|default|delete|do|else|enum|export|extends|finally(?=\s*(?:\{|$))|for|from(?=\s*(?:['"]|$))|function|(?:get|set)(?=\s*(?:[#\[$\w\xA0-\uFFFF]|$))|if|implements|import|in|instanceof|interface|let|new|null|of|package|private|protected|public|return|static|super|switch|this|throw|try|typeof|undefined|var|void|while|with|yield)\b/,
      lookbehind: true
    }
  ],
  function: /#?(?!\s)[_$a-zA-Z\xA0-\uFFFF](?:(?!\s)[$\w\xA0-\uFFFF])*(?=\s*(?:\.\s*(?:apply|bind|call)\s*)?\()/,
  number: {
    pattern: RegExp(/(^|[^\w$])/.source + "(?:" + (/NaN|Infinity/.source + "|" + /0[bB][01]+(?:_[01]+)*n?/.source + "|" + /0[oO][0-7]+(?:_[0-7]+)*n?/.source + "|" + /0[xX][\dA-Fa-f]+(?:_[\dA-Fa-f]+)*n?/.source + "|" + /\d+(?:_\d+)*n/.source + "|" + /(?:\d+(?:_\d+)*(?:\.(?:\d+(?:_\d+)*)?)?|\.\d+(?:_\d+)*)(?:[Ee][+-]?\d+(?:_\d+)*)?/.source) + ")" + /(?![\w$])/.source),
    lookbehind: true
  },
  operator: /--|\+\+|\*\*=?|=>|&&=?|\|\|=?|[!=]==|<<=?|>>>?=?|[-+*/%&|^!=<>]=?|\.{3}|\?\?=?|\?\.?|[~:]/
});
Prism.languages.javascript["class-name"][0].pattern = /(\b(?:class|extends|implements|instanceof|interface|new)\s+)[\w.\\]+/;
Prism.languages.insertBefore("javascript", "keyword", {
  regex: {
    pattern: RegExp(/((?:^|[^$\w\xA0-\uFFFF."'\])\s]|\b(?:return|yield))\s*)/.source + /\//.source + "(?:" + /(?:\[(?:[^\]\\\r\n]|\\.)*\]|\\.|[^/\\\[\r\n])+\/[dgimyus]{0,7}/.source + "|" + /(?:\[(?:[^[\]\\\r\n]|\\.|\[(?:[^[\]\\\r\n]|\\.|\[(?:[^[\]\\\r\n]|\\.)*\])*\])*\]|\\.|[^/\\\[\r\n])+\/[dgimyus]{0,7}v[dgimyus]{0,7}/.source + ")" + /(?=(?:\s|\/\*(?:[^*]|\*(?!\/))*\*\/)*(?:$|[\r\n,.;:})\]]|\/\/))/.source),
    lookbehind: true,
    greedy: true,
    inside: {
      "regex-source": {
        pattern: /^(\/)[\s\S]+(?=\/[a-z]*$)/,
        lookbehind: true,
        alias: "language-regex",
        inside: Prism.languages.regex
      },
      "regex-delimiter": /^\/|\/$/,
      "regex-flags": /^[a-z]+$/
    }
  },
  "function-variable": {
    pattern: /#?(?!\s)[_$a-zA-Z\xA0-\uFFFF](?:(?!\s)[$\w\xA0-\uFFFF])*(?=\s*[=:]\s*(?:async\s*)?(?:\bfunction\b|(?:\((?:[^()]|\([^()]*\))*\)|(?!\s)[_$a-zA-Z\xA0-\uFFFF](?:(?!\s)[$\w\xA0-\uFFFF])*)\s*=>))/,
    alias: "function"
  },
  parameter: [
    {
      pattern: /(function(?:\s+(?!\s)[_$a-zA-Z\xA0-\uFFFF](?:(?!\s)[$\w\xA0-\uFFFF])*)?\s*\(\s*)(?!\s)(?:[^()\s]|\s+(?![\s)])|\([^()]*\))+(?=\s*\))/,
      lookbehind: true,
      inside: Prism.languages.javascript
    },
    {
      pattern: /(^|[^$\w\xA0-\uFFFF])(?!\s)[_$a-z\xA0-\uFFFF](?:(?!\s)[$\w\xA0-\uFFFF])*(?=\s*=>)/i,
      lookbehind: true,
      inside: Prism.languages.javascript
    },
    {
      pattern: /(\(\s*)(?!\s)(?:[^()\s]|\s+(?![\s)])|\([^()]*\))+(?=\s*\)\s*=>)/,
      lookbehind: true,
      inside: Prism.languages.javascript
    },
    {
      pattern: /((?:\b|\s|^)(?!(?:as|async|await|break|case|catch|class|const|continue|debugger|default|delete|do|else|enum|export|extends|finally|for|from|function|get|if|implements|import|in|instanceof|interface|let|new|null|of|package|private|protected|public|return|set|static|super|switch|this|throw|try|typeof|undefined|var|void|while|with|yield)(?![$\w\xA0-\uFFFF]))(?:(?!\s)[_$a-zA-Z\xA0-\uFFFF](?:(?!\s)[$\w\xA0-\uFFFF])*\s*)\(\s*|\]\s*\(\s*)(?!\s)(?:[^()\s]|\s+(?![\s)])|\([^()]*\))+(?=\s*\)\s*\{)/,
      lookbehind: true,
      inside: Prism.languages.javascript
    }
  ],
  constant: /\b[A-Z](?:[A-Z_]|\dx?)*\b/
});
Prism.languages.insertBefore("javascript", "string", {
  hashbang: {
    pattern: /^#!.*/,
    greedy: true,
    alias: "comment"
  },
  "template-string": {
    pattern: /`(?:\\[\s\S]|\$\{(?:[^{}]|\{(?:[^{}]|\{[^}]*\})*\})+\}|(?!\$\{)[^\\`])*`/,
    greedy: true,
    inside: {
      "template-punctuation": {
        pattern: /^`|`$/,
        alias: "string"
      },
      interpolation: {
        pattern: /((?:^|[^\\])(?:\\{2})*)\$\{(?:[^{}]|\{(?:[^{}]|\{[^}]*\})*\})+\}/,
        lookbehind: true,
        inside: {
          "interpolation-punctuation": {
            pattern: /^\$\{|\}$/,
            alias: "punctuation"
          },
          rest: Prism.languages.javascript
        }
      },
      string: /[\s\S]+/
    }
  },
  "string-property": {
    pattern: /((?:^|[,{])[ \t]*)(["'])(?:\\(?:\r\n|[\s\S])|(?!\2)[^\\\r\n])*\2(?=\s*:)/m,
    lookbehind: true,
    greedy: true,
    alias: "property"
  }
});
Prism.languages.insertBefore("javascript", "operator", {
  "literal-property": {
    pattern: /((?:^|[,{])[ \t]*)(?!\s)[_$a-zA-Z\xA0-\uFFFF](?:(?!\s)[$\w\xA0-\uFFFF])*(?=\s*:)/m,
    lookbehind: true,
    alias: "property"
  }
});
if (Prism.languages.markup) {
  Prism.languages.markup.tag.addInlined("script", "javascript");
  Prism.languages.markup.tag.addAttribute(/on(?:abort|blur|change|click|composition(?:end|start|update)|dblclick|error|focus(?:in|out)?|key(?:down|up)|load|mouse(?:down|enter|leave|move|out|over|up)|reset|resize|scroll|select|slotchange|submit|unload|wheel)/.source, "javascript");
}
Prism.languages.js = Prism.languages.javascript;

// node_modules/prismjs/components/prism-typescript.js
(function(Prism2) {
  Prism2.languages.typescript = Prism2.languages.extend("javascript", {
    "class-name": {
      pattern: /(\b(?:class|extends|implements|instanceof|interface|new|type)\s+)(?!keyof\b)(?!\s)[_$a-zA-Z\xA0-\uFFFF](?:(?!\s)[$\w\xA0-\uFFFF])*(?:\s*<(?:[^<>]|<(?:[^<>]|<[^<>]*>)*>)*>)?/,
      lookbehind: true,
      greedy: true,
      inside: null
    },
    builtin: /\b(?:Array|Function|Promise|any|boolean|console|never|number|string|symbol|unknown)\b/
  });
  Prism2.languages.typescript.keyword.push(/\b(?:abstract|declare|is|keyof|readonly|require)\b/, /\b(?:asserts|infer|interface|module|namespace|type)\b(?=\s*(?:[{_$a-zA-Z\xA0-\uFFFF]|$))/, /\btype\b(?=\s*(?:[\{*]|$))/);
  delete Prism2.languages.typescript["parameter"];
  delete Prism2.languages.typescript["literal-property"];
  var typeInside = Prism2.languages.extend("typescript", {});
  delete typeInside["class-name"];
  Prism2.languages.typescript["class-name"].inside = typeInside;
  Prism2.languages.insertBefore("typescript", "function", {
    decorator: {
      pattern: /@[$\w\xA0-\uFFFF]+/,
      inside: {
        at: {
          pattern: /^@/,
          alias: "operator"
        },
        function: /^[\s\S]+/
      }
    },
    "generic-function": {
      pattern: /#?(?!\s)[_$a-zA-Z\xA0-\uFFFF](?:(?!\s)[$\w\xA0-\uFFFF])*\s*<(?:[^<>]|<(?:[^<>]|<[^<>]*>)*>)*>(?=\s*\()/,
      greedy: true,
      inside: {
        function: /^#?(?!\s)[_$a-zA-Z\xA0-\uFFFF](?:(?!\s)[$\w\xA0-\uFFFF])*/,
        generic: {
          pattern: /<[\s\S]+/,
          alias: "class-name",
          inside: typeInside
        }
      }
    }
  });
  Prism2.languages.ts = Prism2.languages.typescript;
})(Prism);

// node_modules/prismjs/components/prism-jsx.js
(function(Prism2) {
  var javascript = Prism2.util.clone(Prism2.languages.javascript);
  var space = /(?:\s|\/\/.*(?!.)|\/\*(?:[^*]|\*(?!\/))\*\/)/.source;
  var braces = /(?:\{(?:\{(?:\{[^{}]*\}|[^{}])*\}|[^{}])*\})/.source;
  var spread = /(?:\{<S>*\.{3}(?:[^{}]|<BRACES>)*\})/.source;
  function re(source, flags) {
    source = source.replace(/<S>/g, function() {
      return space;
    }).replace(/<BRACES>/g, function() {
      return braces;
    }).replace(/<SPREAD>/g, function() {
      return spread;
    });
    return RegExp(source, flags);
  }
  spread = re(spread).source;
  Prism2.languages.jsx = Prism2.languages.extend("markup", javascript);
  Prism2.languages.jsx.tag.pattern = re(/<\/?(?:[\w.:-]+(?:<S>+(?:[\w.:$-]+(?:=(?:"(?:\\[\s\S]|[^\\"])*"|'(?:\\[\s\S]|[^\\'])*'|[^\s{'"/>=]+|<BRACES>))?|<SPREAD>))*<S>*\/?)?>/.source);
  Prism2.languages.jsx.tag.inside["tag"].pattern = /^<\/?[^\s>\/]*/;
  Prism2.languages.jsx.tag.inside["attr-value"].pattern = /=(?!\{)(?:"(?:\\[\s\S]|[^\\"])*"|'(?:\\[\s\S]|[^\\'])*'|[^\s'">]+)/;
  Prism2.languages.jsx.tag.inside["tag"].inside["class-name"] = /^[A-Z]\w*(?:\.[A-Z]\w*)*$/;
  Prism2.languages.jsx.tag.inside["comment"] = javascript["comment"];
  Prism2.languages.insertBefore("inside", "attr-name", {
    spread: {
      pattern: re(/<SPREAD>/.source),
      inside: Prism2.languages.jsx
    }
  }, Prism2.languages.jsx.tag);
  Prism2.languages.insertBefore("inside", "special-attr", {
    script: {
      pattern: re(/=<BRACES>/.source),
      alias: "language-javascript",
      inside: {
        "script-punctuation": {
          pattern: /^=(?=\{)/,
          alias: "punctuation"
        },
        rest: Prism2.languages.jsx
      }
    }
  }, Prism2.languages.jsx.tag);
  var stringifyToken = function(token) {
    if (!token) {
      return "";
    }
    if (typeof token === "string") {
      return token;
    }
    if (typeof token.content === "string") {
      return token.content;
    }
    return token.content.map(stringifyToken).join("");
  };
  var walkTokens = function(tokens) {
    var openedTags = [];
    for (var i = 0;i < tokens.length; i++) {
      var token = tokens[i];
      var notTagNorBrace = false;
      if (typeof token !== "string") {
        if (token.type === "tag" && token.content[0] && token.content[0].type === "tag") {
          if (token.content[0].content[0].content === "</") {
            if (openedTags.length > 0 && openedTags[openedTags.length - 1].tagName === stringifyToken(token.content[0].content[1])) {
              openedTags.pop();
            }
          } else {
            if (token.content[token.content.length - 1].content === "/>") {} else {
              openedTags.push({
                tagName: stringifyToken(token.content[0].content[1]),
                openedBraces: 0
              });
            }
          }
        } else if (openedTags.length > 0 && token.type === "punctuation" && token.content === "{") {
          openedTags[openedTags.length - 1].openedBraces++;
        } else if (openedTags.length > 0 && openedTags[openedTags.length - 1].openedBraces > 0 && token.type === "punctuation" && token.content === "}") {
          openedTags[openedTags.length - 1].openedBraces--;
        } else {
          notTagNorBrace = true;
        }
      }
      if (notTagNorBrace || typeof token === "string") {
        if (openedTags.length > 0 && openedTags[openedTags.length - 1].openedBraces === 0) {
          var plainText = stringifyToken(token);
          if (i < tokens.length - 1 && (typeof tokens[i + 1] === "string" || tokens[i + 1].type === "plain-text")) {
            plainText += stringifyToken(tokens[i + 1]);
            tokens.splice(i + 1, 1);
          }
          if (i > 0 && (typeof tokens[i - 1] === "string" || tokens[i - 1].type === "plain-text")) {
            plainText = stringifyToken(tokens[i - 1]) + plainText;
            tokens.splice(i - 1, 1);
            i--;
          }
          tokens[i] = new Prism2.Token("plain-text", plainText, null, plainText);
        }
      }
      if (token.content && typeof token.content !== "string") {
        walkTokens(token.content);
      }
    }
  };
  Prism2.hooks.add("after-tokenize", function(env) {
    if (env.language !== "jsx" && env.language !== "tsx") {
      return;
    }
    walkTokens(env.tokens);
  });
})(Prism);

// node_modules/prismjs/components/prism-tsx.js
(function(Prism2) {
  var typescript = Prism2.util.clone(Prism2.languages.typescript);
  Prism2.languages.tsx = Prism2.languages.extend("jsx", typescript);
  delete Prism2.languages.tsx["parameter"];
  delete Prism2.languages.tsx["literal-property"];
  var tag = Prism2.languages.tsx.tag;
  tag.pattern = RegExp(/(^|[^\w$]|(?=<\/))/.source + "(?:" + tag.pattern.source + ")", tag.pattern.flags);
  tag.lookbehind = true;
})(Prism);

// node_modules/prismjs/components/prism-c.js
Prism.languages.c = Prism.languages.extend("clike", {
  comment: {
    pattern: /\/\/(?:[^\r\n\\]|\\(?:\r\n?|\n|(?![\r\n])))*|\/\*[\s\S]*?(?:\*\/|$)/,
    greedy: true
  },
  string: {
    pattern: /"(?:\\(?:\r\n|[\s\S])|[^"\\\r\n])*"/,
    greedy: true
  },
  "class-name": {
    pattern: /(\b(?:enum|struct)\s+(?:__attribute__\s*\(\([\s\S]*?\)\)\s*)?)\w+|\b[a-z]\w*_t\b/,
    lookbehind: true
  },
  keyword: /\b(?:_Alignas|_Alignof|_Atomic|_Bool|_Complex|_Generic|_Imaginary|_Noreturn|_Static_assert|_Thread_local|__attribute__|asm|auto|break|case|char|const|continue|default|do|double|else|enum|extern|float|for|goto|if|inline|int|long|register|return|short|signed|sizeof|static|struct|switch|typedef|typeof|union|unsigned|void|volatile|while)\b/,
  function: /\b[a-z_]\w*(?=\s*\()/i,
  number: /(?:\b0x(?:[\da-f]+(?:\.[\da-f]*)?|\.[\da-f]+)(?:p[+-]?\d+)?|(?:\b\d+(?:\.\d*)?|\B\.\d+)(?:e[+-]?\d+)?)[ful]{0,4}/i,
  operator: />>=?|<<=?|->|([-+&|:])\1|[?:~]|[-+*/%&|^!=<>]=?/
});
Prism.languages.insertBefore("c", "string", {
  char: {
    pattern: /'(?:\\(?:\r\n|[\s\S])|[^'\\\r\n]){0,32}'/,
    greedy: true
  }
});
Prism.languages.insertBefore("c", "string", {
  macro: {
    pattern: /(^[\t ]*)#\s*[a-z](?:[^\r\n\\/]|\/(?!\*)|\/\*(?:[^*]|\*(?!\/))*\*\/|\\(?:\r\n|[\s\S]))*/im,
    lookbehind: true,
    greedy: true,
    alias: "property",
    inside: {
      string: [
        {
          pattern: /^(#\s*include\s*)<[^>]+>/,
          lookbehind: true
        },
        Prism.languages.c["string"]
      ],
      char: Prism.languages.c["char"],
      comment: Prism.languages.c["comment"],
      "macro-name": [
        {
          pattern: /(^#\s*define\s+)\w+\b(?!\()/i,
          lookbehind: true
        },
        {
          pattern: /(^#\s*define\s+)\w+\b(?=\()/i,
          lookbehind: true,
          alias: "function"
        }
      ],
      directive: {
        pattern: /^(#\s*)[a-z]+/,
        lookbehind: true,
        alias: "keyword"
      },
      "directive-hash": /^#/,
      punctuation: /##|\\(?=[\r\n])/,
      expression: {
        pattern: /\S[\s\S]*/,
        inside: Prism.languages.c
      }
    }
  }
});
Prism.languages.insertBefore("c", "function", {
  constant: /\b(?:EOF|NULL|SEEK_CUR|SEEK_END|SEEK_SET|__DATE__|__FILE__|__LINE__|__TIMESTAMP__|__TIME__|__func__|stderr|stdin|stdout)\b/
});
delete Prism.languages.c["boolean"];

// node_modules/prismjs/components/prism-cpp.js
(function(Prism2) {
  var keyword = /\b(?:alignas|alignof|asm|auto|bool|break|case|catch|char|char16_t|char32_t|char8_t|class|co_await|co_return|co_yield|compl|concept|const|const_cast|consteval|constexpr|constinit|continue|decltype|default|delete|do|double|dynamic_cast|else|enum|explicit|export|extern|final|float|for|friend|goto|if|import|inline|int|int16_t|int32_t|int64_t|int8_t|long|module|mutable|namespace|new|noexcept|nullptr|operator|override|private|protected|public|register|reinterpret_cast|requires|return|short|signed|sizeof|static|static_assert|static_cast|struct|switch|template|this|thread_local|throw|try|typedef|typeid|typename|uint16_t|uint32_t|uint64_t|uint8_t|union|unsigned|using|virtual|void|volatile|wchar_t|while)\b/;
  var modName = /\b(?!<keyword>)\w+(?:\s*\.\s*\w+)*\b/.source.replace(/<keyword>/g, function() {
    return keyword.source;
  });
  Prism2.languages.cpp = Prism2.languages.extend("c", {
    "class-name": [
      {
        pattern: RegExp(/(\b(?:class|concept|enum|struct|typename)\s+)(?!<keyword>)\w+/.source.replace(/<keyword>/g, function() {
          return keyword.source;
        })),
        lookbehind: true
      },
      /\b[A-Z]\w*(?=\s*::\s*\w+\s*\()/,
      /\b[A-Z_]\w*(?=\s*::\s*~\w+\s*\()/i,
      /\b\w+(?=\s*<(?:[^<>]|<(?:[^<>]|<[^<>]*>)*>)*>\s*::\s*\w+\s*\()/
    ],
    keyword,
    number: {
      pattern: /(?:\b0b[01']+|\b0x(?:[\da-f']+(?:\.[\da-f']*)?|\.[\da-f']+)(?:p[+-]?[\d']+)?|(?:\b[\d']+(?:\.[\d']*)?|\B\.[\d']+)(?:e[+-]?[\d']+)?)[ful]{0,4}/i,
      greedy: true
    },
    operator: />>=?|<<=?|->|--|\+\+|&&|\|\||[?:~]|<=>|[-+*/%&|^!=<>]=?|\b(?:and|and_eq|bitand|bitor|not|not_eq|or|or_eq|xor|xor_eq)\b/,
    boolean: /\b(?:false|true)\b/
  });
  Prism2.languages.insertBefore("cpp", "string", {
    module: {
      pattern: RegExp(/(\b(?:import|module)\s+)/.source + "(?:" + /"(?:\\(?:\r\n|[\s\S])|[^"\\\r\n])*"|<[^<>\r\n]*>/.source + "|" + /<mod-name>(?:\s*:\s*<mod-name>)?|:\s*<mod-name>/.source.replace(/<mod-name>/g, function() {
        return modName;
      }) + ")"),
      lookbehind: true,
      greedy: true,
      inside: {
        string: /^[<"][\s\S]+/,
        operator: /:/,
        punctuation: /\./
      }
    },
    "raw-string": {
      pattern: /R"([^()\\ ]{0,16})\([\s\S]*?\)\1"/,
      alias: "string",
      greedy: true
    }
  });
  Prism2.languages.insertBefore("cpp", "keyword", {
    "generic-function": {
      pattern: /\b(?!operator\b)[a-z_]\w*\s*<(?:[^<>]|<[^<>]*>)*>(?=\s*\()/i,
      inside: {
        function: /^\w+/,
        generic: {
          pattern: /<[\s\S]+/,
          alias: "class-name",
          inside: Prism2.languages.cpp
        }
      }
    }
  });
  Prism2.languages.insertBefore("cpp", "operator", {
    "double-colon": {
      pattern: /::/,
      alias: "punctuation"
    }
  });
  Prism2.languages.insertBefore("cpp", "class-name", {
    "base-clause": {
      pattern: /(\b(?:class|struct)\s+\w+\s*:\s*)[^;{}"'\s]+(?:\s+[^;{}"'\s]+)*(?=\s*[;{])/,
      lookbehind: true,
      greedy: true,
      inside: Prism2.languages.extend("cpp", {})
    }
  });
  Prism2.languages.insertBefore("inside", "double-colon", {
    "class-name": /\b[a-z_]\w*\b(?!\s*::)/i
  }, Prism2.languages.cpp["base-clause"]);
})(Prism);

// node_modules/prismjs/components/prism-csharp.js
(function(Prism2) {
  function replace(pattern, replacements) {
    return pattern.replace(/<<(\d+)>>/g, function(m, index) {
      return "(?:" + replacements[+index] + ")";
    });
  }
  function re(pattern, replacements, flags) {
    return RegExp(replace(pattern, replacements), flags || "");
  }
  function nested(pattern, depthLog2) {
    for (var i = 0;i < depthLog2; i++) {
      pattern = pattern.replace(/<<self>>/g, function() {
        return "(?:" + pattern + ")";
      });
    }
    return pattern.replace(/<<self>>/g, "[^\\s\\S]");
  }
  var keywordKinds = {
    type: "bool byte char decimal double dynamic float int long object sbyte short string uint ulong ushort var void",
    typeDeclaration: "class enum interface record struct",
    contextual: "add alias and ascending async await by descending from(?=\\s*(?:\\w|$)) get global group into init(?=\\s*;) join let nameof not notnull on or orderby partial remove select set unmanaged value when where with(?=\\s*{)",
    other: "abstract as base break case catch checked const continue default delegate do else event explicit extern finally fixed for foreach goto if implicit in internal is lock namespace new null operator out override params private protected public readonly ref return sealed sizeof stackalloc static switch this throw try typeof unchecked unsafe using virtual volatile while yield"
  };
  function keywordsToPattern(words) {
    return "\\b(?:" + words.trim().replace(/ /g, "|") + ")\\b";
  }
  var typeDeclarationKeywords = keywordsToPattern(keywordKinds.typeDeclaration);
  var keywords = RegExp(keywordsToPattern(keywordKinds.type + " " + keywordKinds.typeDeclaration + " " + keywordKinds.contextual + " " + keywordKinds.other));
  var nonTypeKeywords = keywordsToPattern(keywordKinds.typeDeclaration + " " + keywordKinds.contextual + " " + keywordKinds.other);
  var nonContextualKeywords = keywordsToPattern(keywordKinds.type + " " + keywordKinds.typeDeclaration + " " + keywordKinds.other);
  var generic = nested(/<(?:[^<>;=+\-*/%&|^]|<<self>>)*>/.source, 2);
  var nestedRound = nested(/\((?:[^()]|<<self>>)*\)/.source, 2);
  var name = /@?\b[A-Za-z_]\w*\b/.source;
  var genericName = replace(/<<0>>(?:\s*<<1>>)?/.source, [name, generic]);
  var identifier = replace(/(?!<<0>>)<<1>>(?:\s*\.\s*<<1>>)*/.source, [nonTypeKeywords, genericName]);
  var array = /\[\s*(?:,\s*)*\]/.source;
  var typeExpressionWithoutTuple = replace(/<<0>>(?:\s*(?:\?\s*)?<<1>>)*(?:\s*\?)?/.source, [identifier, array]);
  var tupleElement = replace(/[^,()<>[\];=+\-*/%&|^]|<<0>>|<<1>>|<<2>>/.source, [generic, nestedRound, array]);
  var tuple = replace(/\(<<0>>+(?:,<<0>>+)+\)/.source, [tupleElement]);
  var typeExpression = replace(/(?:<<0>>|<<1>>)(?:\s*(?:\?\s*)?<<2>>)*(?:\s*\?)?/.source, [tuple, identifier, array]);
  var typeInside = {
    keyword: keywords,
    punctuation: /[<>()?,.:[\]]/
  };
  var character = /'(?:[^\r\n'\\]|\\.|\\[Uux][\da-fA-F]{1,8})'/.source;
  var regularString = /"(?:\\.|[^\\"\r\n])*"/.source;
  var verbatimString = /@"(?:""|\\[\s\S]|[^\\"])*"(?!")/.source;
  Prism2.languages.csharp = Prism2.languages.extend("clike", {
    string: [
      {
        pattern: re(/(^|[^$\\])<<0>>/.source, [verbatimString]),
        lookbehind: true,
        greedy: true
      },
      {
        pattern: re(/(^|[^@$\\])<<0>>/.source, [regularString]),
        lookbehind: true,
        greedy: true
      }
    ],
    "class-name": [
      {
        pattern: re(/(\busing\s+static\s+)<<0>>(?=\s*;)/.source, [identifier]),
        lookbehind: true,
        inside: typeInside
      },
      {
        pattern: re(/(\busing\s+<<0>>\s*=\s*)<<1>>(?=\s*;)/.source, [name, typeExpression]),
        lookbehind: true,
        inside: typeInside
      },
      {
        pattern: re(/(\busing\s+)<<0>>(?=\s*=)/.source, [name]),
        lookbehind: true
      },
      {
        pattern: re(/(\b<<0>>\s+)<<1>>/.source, [typeDeclarationKeywords, genericName]),
        lookbehind: true,
        inside: typeInside
      },
      {
        pattern: re(/(\bcatch\s*\(\s*)<<0>>/.source, [identifier]),
        lookbehind: true,
        inside: typeInside
      },
      {
        pattern: re(/(\bwhere\s+)<<0>>/.source, [name]),
        lookbehind: true
      },
      {
        pattern: re(/(\b(?:is(?:\s+not)?|as)\s+)<<0>>/.source, [typeExpressionWithoutTuple]),
        lookbehind: true,
        inside: typeInside
      },
      {
        pattern: re(/\b<<0>>(?=\s+(?!<<1>>|with\s*\{)<<2>>(?:\s*[=,;:{)\]]|\s+(?:in|when)\b))/.source, [typeExpression, nonContextualKeywords, name]),
        inside: typeInside
      }
    ],
    keyword: keywords,
    number: /(?:\b0(?:x[\da-f_]*[\da-f]|b[01_]*[01])|(?:\B\.\d+(?:_+\d+)*|\b\d+(?:_+\d+)*(?:\.\d+(?:_+\d+)*)?)(?:e[-+]?\d+(?:_+\d+)*)?)(?:[dflmu]|lu|ul)?\b/i,
    operator: />>=?|<<=?|[-=]>|([-+&|])\1|~|\?\?=?|[-+*/%&|^!=<>]=?/,
    punctuation: /\?\.?|::|[{}[\];(),.:]/
  });
  Prism2.languages.insertBefore("csharp", "number", {
    range: {
      pattern: /\.\./,
      alias: "operator"
    }
  });
  Prism2.languages.insertBefore("csharp", "punctuation", {
    "named-parameter": {
      pattern: re(/([(,]\s*)<<0>>(?=\s*:)/.source, [name]),
      lookbehind: true,
      alias: "punctuation"
    }
  });
  Prism2.languages.insertBefore("csharp", "class-name", {
    namespace: {
      pattern: re(/(\b(?:namespace|using)\s+)<<0>>(?:\s*\.\s*<<0>>)*(?=\s*[;{])/.source, [name]),
      lookbehind: true,
      inside: {
        punctuation: /\./
      }
    },
    "type-expression": {
      pattern: re(/(\b(?:default|sizeof|typeof)\s*\(\s*(?!\s))(?:[^()\s]|\s(?!\s)|<<0>>)*(?=\s*\))/.source, [nestedRound]),
      lookbehind: true,
      alias: "class-name",
      inside: typeInside
    },
    "return-type": {
      pattern: re(/<<0>>(?=\s+(?:<<1>>\s*(?:=>|[({]|\.\s*this\s*\[)|this\s*\[))/.source, [typeExpression, identifier]),
      inside: typeInside,
      alias: "class-name"
    },
    "constructor-invocation": {
      pattern: re(/(\bnew\s+)<<0>>(?=\s*[[({])/.source, [typeExpression]),
      lookbehind: true,
      inside: typeInside,
      alias: "class-name"
    },
    "generic-method": {
      pattern: re(/<<0>>\s*<<1>>(?=\s*\()/.source, [name, generic]),
      inside: {
        function: re(/^<<0>>/.source, [name]),
        generic: {
          pattern: RegExp(generic),
          alias: "class-name",
          inside: typeInside
        }
      }
    },
    "type-list": {
      pattern: re(/\b((?:<<0>>\s+<<1>>|record\s+<<1>>\s*<<5>>|where\s+<<2>>)\s*:\s*)(?:<<3>>|<<4>>|<<1>>\s*<<5>>|<<6>>)(?:\s*,\s*(?:<<3>>|<<4>>|<<6>>))*(?=\s*(?:where|[{;]|=>|$))/.source, [typeDeclarationKeywords, genericName, name, typeExpression, keywords.source, nestedRound, /\bnew\s*\(\s*\)/.source]),
      lookbehind: true,
      inside: {
        "record-arguments": {
          pattern: re(/(^(?!new\s*\()<<0>>\s*)<<1>>/.source, [genericName, nestedRound]),
          lookbehind: true,
          greedy: true,
          inside: Prism2.languages.csharp
        },
        keyword: keywords,
        "class-name": {
          pattern: RegExp(typeExpression),
          greedy: true,
          inside: typeInside
        },
        punctuation: /[,()]/
      }
    },
    preprocessor: {
      pattern: /(^[\t ]*)#.*/m,
      lookbehind: true,
      alias: "property",
      inside: {
        directive: {
          pattern: /(#)\b(?:define|elif|else|endif|endregion|error|if|line|nullable|pragma|region|undef|warning)\b/,
          lookbehind: true,
          alias: "keyword"
        }
      }
    }
  });
  var regularStringOrCharacter = regularString + "|" + character;
  var regularStringCharacterOrComment = replace(/\/(?![*/])|\/\/[^\r\n]*[\r\n]|\/\*(?:[^*]|\*(?!\/))*\*\/|<<0>>/.source, [regularStringOrCharacter]);
  var roundExpression = nested(replace(/[^"'/()]|<<0>>|\(<<self>>*\)/.source, [regularStringCharacterOrComment]), 2);
  var attrTarget = /\b(?:assembly|event|field|method|module|param|property|return|type)\b/.source;
  var attr = replace(/<<0>>(?:\s*\(<<1>>*\))?/.source, [identifier, roundExpression]);
  Prism2.languages.insertBefore("csharp", "class-name", {
    attribute: {
      pattern: re(/((?:^|[^\s\w>)?])\s*\[\s*)(?:<<0>>\s*:\s*)?<<1>>(?:\s*,\s*<<1>>)*(?=\s*\])/.source, [attrTarget, attr]),
      lookbehind: true,
      greedy: true,
      inside: {
        target: {
          pattern: re(/^<<0>>(?=\s*:)/.source, [attrTarget]),
          alias: "keyword"
        },
        "attribute-arguments": {
          pattern: re(/\(<<0>>*\)/.source, [roundExpression]),
          inside: Prism2.languages.csharp
        },
        "class-name": {
          pattern: RegExp(identifier),
          inside: {
            punctuation: /\./
          }
        },
        punctuation: /[:,]/
      }
    }
  });
  var formatString = /:[^}\r\n]+/.source;
  var mInterpolationRound = nested(replace(/[^"'/()]|<<0>>|\(<<self>>*\)/.source, [regularStringCharacterOrComment]), 2);
  var mInterpolation = replace(/\{(?!\{)(?:(?![}:])<<0>>)*<<1>>?\}/.source, [mInterpolationRound, formatString]);
  var sInterpolationRound = nested(replace(/[^"'/()]|\/(?!\*)|\/\*(?:[^*]|\*(?!\/))*\*\/|<<0>>|\(<<self>>*\)/.source, [regularStringOrCharacter]), 2);
  var sInterpolation = replace(/\{(?!\{)(?:(?![}:])<<0>>)*<<1>>?\}/.source, [sInterpolationRound, formatString]);
  function createInterpolationInside(interpolation, interpolationRound) {
    return {
      interpolation: {
        pattern: re(/((?:^|[^{])(?:\{\{)*)<<0>>/.source, [interpolation]),
        lookbehind: true,
        inside: {
          "format-string": {
            pattern: re(/(^\{(?:(?![}:])<<0>>)*)<<1>>(?=\}$)/.source, [interpolationRound, formatString]),
            lookbehind: true,
            inside: {
              punctuation: /^:/
            }
          },
          punctuation: /^\{|\}$/,
          expression: {
            pattern: /[\s\S]+/,
            alias: "language-csharp",
            inside: Prism2.languages.csharp
          }
        }
      },
      string: /[\s\S]+/
    };
  }
  Prism2.languages.insertBefore("csharp", "string", {
    "interpolation-string": [
      {
        pattern: re(/(^|[^\\])(?:\$@|@\$)"(?:""|\\[\s\S]|\{\{|<<0>>|[^\\{"])*"/.source, [mInterpolation]),
        lookbehind: true,
        greedy: true,
        inside: createInterpolationInside(mInterpolation, mInterpolationRound)
      },
      {
        pattern: re(/(^|[^@\\])\$"(?:\\.|\{\{|<<0>>|[^\\"{])*"/.source, [sInterpolation]),
        lookbehind: true,
        greedy: true,
        inside: createInterpolationInside(sInterpolation, sInterpolationRound)
      }
    ],
    char: {
      pattern: RegExp(character),
      greedy: true
    }
  });
  Prism2.languages.dotnet = Prism2.languages.cs = Prism2.languages.csharp;
})(Prism);

// node_modules/prismjs/components/prism-java.js
(function(Prism2) {
  var keywords = /\b(?:abstract|assert|boolean|break|byte|case|catch|char|class|const|continue|default|do|double|else|enum|exports|extends|final|finally|float|for|goto|if|implements|import|instanceof|int|interface|long|module|native|new|non-sealed|null|open|opens|package|permits|private|protected|provides|public|record(?!\s*[(){}[\]<>=%~.:,;?+\-*/&|^])|requires|return|sealed|short|static|strictfp|super|switch|synchronized|this|throw|throws|to|transient|transitive|try|uses|var|void|volatile|while|with|yield)\b/;
  var classNamePrefix = /(?:[a-z]\w*\s*\.\s*)*(?:[A-Z]\w*\s*\.\s*)*/.source;
  var className = {
    pattern: RegExp(/(^|[^\w.])/.source + classNamePrefix + /[A-Z](?:[\d_A-Z]*[a-z]\w*)?\b/.source),
    lookbehind: true,
    inside: {
      namespace: {
        pattern: /^[a-z]\w*(?:\s*\.\s*[a-z]\w*)*(?:\s*\.)?/,
        inside: {
          punctuation: /\./
        }
      },
      punctuation: /\./
    }
  };
  Prism2.languages.java = Prism2.languages.extend("clike", {
    string: {
      pattern: /(^|[^\\])"(?:\\.|[^"\\\r\n])*"/,
      lookbehind: true,
      greedy: true
    },
    "class-name": [
      className,
      {
        pattern: RegExp(/(^|[^\w.])/.source + classNamePrefix + /[A-Z]\w*(?=\s+\w+\s*[;,=()]|\s*(?:\[[\s,]*\]\s*)?::\s*new\b)/.source),
        lookbehind: true,
        inside: className.inside
      },
      {
        pattern: RegExp(/(\b(?:class|enum|extends|implements|instanceof|interface|new|record|throws)\s+)/.source + classNamePrefix + /[A-Z]\w*\b/.source),
        lookbehind: true,
        inside: className.inside
      }
    ],
    keyword: keywords,
    function: [
      Prism2.languages.clike.function,
      {
        pattern: /(::\s*)[a-z_]\w*/,
        lookbehind: true
      }
    ],
    number: /\b0b[01][01_]*L?\b|\b0x(?:\.[\da-f_p+-]+|[\da-f_]+(?:\.[\da-f_p+-]+)?)\b|(?:\b\d[\d_]*(?:\.[\d_]*)?|\B\.\d[\d_]*)(?:e[+-]?\d[\d_]*)?[dfl]?/i,
    operator: {
      pattern: /(^|[^.])(?:<<=?|>>>?=?|->|--|\+\+|&&|\|\||::|[?:~]|[-+*/%&|^!=<>]=?)/m,
      lookbehind: true
    },
    constant: /\b[A-Z][A-Z_\d]+\b/
  });
  Prism2.languages.insertBefore("java", "string", {
    "triple-quoted-string": {
      pattern: /"""[ \t]*[\r\n](?:(?:"|"")?(?:\\.|[^"\\]))*"""/,
      greedy: true,
      alias: "string"
    },
    char: {
      pattern: /'(?:\\.|[^'\\\r\n]){1,6}'/,
      greedy: true
    }
  });
  Prism2.languages.insertBefore("java", "class-name", {
    annotation: {
      pattern: /(^|[^.])@\w+(?:\s*\.\s*\w+)*/,
      lookbehind: true,
      alias: "punctuation"
    },
    generics: {
      pattern: /<(?:[\w\s,.?]|&(?!&)|<(?:[\w\s,.?]|&(?!&)|<(?:[\w\s,.?]|&(?!&)|<(?:[\w\s,.?]|&(?!&))*>)*>)*>)*>/,
      inside: {
        "class-name": className,
        keyword: keywords,
        punctuation: /[<>(),.:]/,
        operator: /[?&|]/
      }
    },
    import: [
      {
        pattern: RegExp(/(\bimport\s+)/.source + classNamePrefix + /(?:[A-Z]\w*|\*)(?=\s*;)/.source),
        lookbehind: true,
        inside: {
          namespace: className.inside.namespace,
          punctuation: /\./,
          operator: /\*/,
          "class-name": /\w+/
        }
      },
      {
        pattern: RegExp(/(\bimport\s+static\s+)/.source + classNamePrefix + /(?:\w+|\*)(?=\s*;)/.source),
        lookbehind: true,
        alias: "static",
        inside: {
          namespace: className.inside.namespace,
          static: /\b\w+$/,
          punctuation: /\./,
          operator: /\*/,
          "class-name": /\w+/
        }
      }
    ],
    namespace: {
      pattern: RegExp(/(\b(?:exports|import(?:\s+static)?|module|open|opens|package|provides|requires|to|transitive|uses|with)\s+)(?!<keyword>)[a-z]\w*(?:\.[a-z]\w*)*\.?/.source.replace(/<keyword>/g, function() {
        return keywords.source;
      })),
      lookbehind: true,
      inside: {
        punctuation: /\./
      }
    }
  });
})(Prism);

// node_modules/prismjs/components/prism-kotlin.js
(function(Prism2) {
  Prism2.languages.kotlin = Prism2.languages.extend("clike", {
    keyword: {
      pattern: /(^|[^.])\b(?:abstract|actual|annotation|as|break|by|catch|class|companion|const|constructor|continue|crossinline|data|do|dynamic|else|enum|expect|external|final|finally|for|fun|get|if|import|in|infix|init|inline|inner|interface|internal|is|lateinit|noinline|null|object|open|operator|out|override|package|private|protected|public|reified|return|sealed|set|super|suspend|tailrec|this|throw|to|try|typealias|val|var|vararg|when|where|while)\b/,
      lookbehind: true
    },
    function: [
      {
        pattern: /(?:`[^\r\n`]+`|\b\w+)(?=\s*\()/,
        greedy: true
      },
      {
        pattern: /(\.)(?:`[^\r\n`]+`|\w+)(?=\s*\{)/,
        lookbehind: true,
        greedy: true
      }
    ],
    number: /\b(?:0[xX][\da-fA-F]+(?:_[\da-fA-F]+)*|0[bB][01]+(?:_[01]+)*|\d+(?:_\d+)*(?:\.\d+(?:_\d+)*)?(?:[eE][+-]?\d+(?:_\d+)*)?[fFL]?)\b/,
    operator: /\+[+=]?|-[-=>]?|==?=?|!(?:!|==?)?|[\/*%<>]=?|[?:]:?|\.\.|&&|\|\||\b(?:and|inv|or|shl|shr|ushr|xor)\b/
  });
  delete Prism2.languages.kotlin["class-name"];
  var interpolationInside = {
    "interpolation-punctuation": {
      pattern: /^\$\{?|\}$/,
      alias: "punctuation"
    },
    expression: {
      pattern: /[\s\S]+/,
      inside: Prism2.languages.kotlin
    }
  };
  Prism2.languages.insertBefore("kotlin", "string", {
    "string-literal": [
      {
        pattern: /"""(?:[^$]|\$(?:(?!\{)|\{[^{}]*\}))*?"""/,
        alias: "multiline",
        inside: {
          interpolation: {
            pattern: /\$(?:[a-z_]\w*|\{[^{}]*\})/i,
            inside: interpolationInside
          },
          string: /[\s\S]+/
        }
      },
      {
        pattern: /"(?:[^"\\\r\n$]|\\.|\$(?:(?!\{)|\{[^{}]*\}))*"/,
        alias: "singleline",
        inside: {
          interpolation: {
            pattern: /((?:^|[^\\])(?:\\{2})*)\$(?:[a-z_]\w*|\{[^{}]*\})/i,
            lookbehind: true,
            inside: interpolationInside
          },
          string: /[\s\S]+/
        }
      }
    ],
    char: {
      pattern: /'(?:[^'\\\r\n]|\\(?:.|u[a-fA-F0-9]{0,4}))'/,
      greedy: true
    }
  });
  delete Prism2.languages.kotlin["string"];
  Prism2.languages.insertBefore("kotlin", "keyword", {
    annotation: {
      pattern: /\B@(?:\w+:)?(?:[A-Z]\w*|\[[^\]]+\])/,
      alias: "builtin"
    }
  });
  Prism2.languages.insertBefore("kotlin", "function", {
    label: {
      pattern: /\b\w+@|@\w+\b/,
      alias: "symbol"
    }
  });
  Prism2.languages.kt = Prism2.languages.kotlin;
  Prism2.languages.kts = Prism2.languages.kotlin;
})(Prism);

// node_modules/prismjs/components/prism-go.js
Prism.languages.go = Prism.languages.extend("clike", {
  string: {
    pattern: /(^|[^\\])"(?:\\.|[^"\\\r\n])*"|`[^`]*`/,
    lookbehind: true,
    greedy: true
  },
  keyword: /\b(?:break|case|chan|const|continue|default|defer|else|fallthrough|for|func|go(?:to)?|if|import|interface|map|package|range|return|select|struct|switch|type|var)\b/,
  boolean: /\b(?:_|false|iota|nil|true)\b/,
  number: [
    /\b0(?:b[01_]+|o[0-7_]+)i?\b/i,
    /\b0x(?:[a-f\d_]+(?:\.[a-f\d_]*)?|\.[a-f\d_]+)(?:p[+-]?\d+(?:_\d+)*)?i?(?!\w)/i,
    /(?:\b\d[\d_]*(?:\.[\d_]*)?|\B\.\d[\d_]*)(?:e[+-]?[\d_]+)?i?(?!\w)/i
  ],
  operator: /[*\/%^!=]=?|\+[=+]?|-[=-]?|\|[=|]?|&(?:=|&|\^=?)?|>(?:>=?|=)?|<(?:<=?|=|-)?|:=|\.\.\./,
  builtin: /\b(?:append|bool|byte|cap|close|complex|complex(?:64|128)|copy|delete|error|float(?:32|64)|u?int(?:8|16|32|64)?|imag|len|make|new|panic|print(?:ln)?|real|recover|rune|string|uintptr)\b/
});
Prism.languages.insertBefore("go", "string", {
  char: {
    pattern: /'(?:\\.|[^'\\\r\n]){0,10}'/,
    greedy: true
  }
});
delete Prism.languages.go["class-name"];

// node_modules/prismjs/components/prism-rust.js
(function(Prism2) {
  var multilineComment = /\/\*(?:[^*/]|\*(?!\/)|\/(?!\*)|<self>)*\*\//.source;
  for (var i = 0;i < 2; i++) {
    multilineComment = multilineComment.replace(/<self>/g, function() {
      return multilineComment;
    });
  }
  multilineComment = multilineComment.replace(/<self>/g, function() {
    return /[^\s\S]/.source;
  });
  Prism2.languages.rust = {
    comment: [
      {
        pattern: RegExp(/(^|[^\\])/.source + multilineComment),
        lookbehind: true,
        greedy: true
      },
      {
        pattern: /(^|[^\\:])\/\/.*/,
        lookbehind: true,
        greedy: true
      }
    ],
    string: {
      pattern: /b?"(?:\\[\s\S]|[^\\"])*"|b?r(#*)"(?:[^"]|"(?!\1))*"\1/,
      greedy: true
    },
    char: {
      pattern: /b?'(?:\\(?:x[0-7][\da-fA-F]|u\{(?:[\da-fA-F]_*){1,6}\}|.)|[^\\\r\n\t'])'/,
      greedy: true
    },
    attribute: {
      pattern: /#!?\[(?:[^\[\]"]|"(?:\\[\s\S]|[^\\"])*")*\]/,
      greedy: true,
      alias: "attr-name",
      inside: {
        string: null
      }
    },
    "closure-params": {
      pattern: /([=(,:]\s*|\bmove\s*)\|[^|]*\||\|[^|]*\|(?=\s*(?:\{|->))/,
      lookbehind: true,
      greedy: true,
      inside: {
        "closure-punctuation": {
          pattern: /^\||\|$/,
          alias: "punctuation"
        },
        rest: null
      }
    },
    "lifetime-annotation": {
      pattern: /'\w+/,
      alias: "symbol"
    },
    "fragment-specifier": {
      pattern: /(\$\w+:)[a-z]+/,
      lookbehind: true,
      alias: "punctuation"
    },
    variable: /\$\w+/,
    "function-definition": {
      pattern: /(\bfn\s+)\w+/,
      lookbehind: true,
      alias: "function"
    },
    "type-definition": {
      pattern: /(\b(?:enum|struct|trait|type|union)\s+)\w+/,
      lookbehind: true,
      alias: "class-name"
    },
    "module-declaration": [
      {
        pattern: /(\b(?:crate|mod)\s+)[a-z][a-z_\d]*/,
        lookbehind: true,
        alias: "namespace"
      },
      {
        pattern: /(\b(?:crate|self|super)\s*)::\s*[a-z][a-z_\d]*\b(?:\s*::(?:\s*[a-z][a-z_\d]*\s*::)*)?/,
        lookbehind: true,
        alias: "namespace",
        inside: {
          punctuation: /::/
        }
      }
    ],
    keyword: [
      /\b(?:Self|abstract|as|async|await|become|box|break|const|continue|crate|do|dyn|else|enum|extern|final|fn|for|if|impl|in|let|loop|macro|match|mod|move|mut|override|priv|pub|ref|return|self|static|struct|super|trait|try|type|typeof|union|unsafe|unsized|use|virtual|where|while|yield)\b/,
      /\b(?:bool|char|f(?:32|64)|[ui](?:8|16|32|64|128|size)|str)\b/
    ],
    function: /\b[a-z_]\w*(?=\s*(?:::\s*<|\())/,
    macro: {
      pattern: /\b\w+!/,
      alias: "property"
    },
    constant: /\b[A-Z_][A-Z_\d]+\b/,
    "class-name": /\b[A-Z]\w*\b/,
    namespace: {
      pattern: /(?:\b[a-z][a-z_\d]*\s*::\s*)*\b[a-z][a-z_\d]*\s*::(?!\s*<)/,
      inside: {
        punctuation: /::/
      }
    },
    number: /\b(?:0x[\dA-Fa-f](?:_?[\dA-Fa-f])*|0o[0-7](?:_?[0-7])*|0b[01](?:_?[01])*|(?:(?:\d(?:_?\d)*)?\.)?\d(?:_?\d)*(?:[Ee][+-]?\d+)?)(?:_?(?:f32|f64|[iu](?:8|16|32|64|size)?))?\b/,
    boolean: /\b(?:false|true)\b/,
    punctuation: /->|\.\.=|\.{1,3}|::|[{}[\];(),:]/,
    operator: /[-+*\/%!^]=?|=[=>]?|&[&=]?|\|[|=]?|<<?=?|>>?=?|[@?]/
  };
  Prism2.languages.rust["closure-params"].inside.rest = Prism2.languages.rust;
  Prism2.languages.rust["attribute"].inside["string"] = Prism2.languages.rust["string"];
})(Prism);

// node_modules/prismjs/components/prism-python.js
Prism.languages.python = {
  comment: {
    pattern: /(^|[^\\])#.*/,
    lookbehind: true,
    greedy: true
  },
  "string-interpolation": {
    pattern: /(?:f|fr|rf)(?:("""|''')[\s\S]*?\1|("|')(?:\\.|(?!\2)[^\\\r\n])*\2)/i,
    greedy: true,
    inside: {
      interpolation: {
        pattern: /((?:^|[^{])(?:\{\{)*)\{(?!\{)(?:[^{}]|\{(?!\{)(?:[^{}]|\{(?!\{)(?:[^{}])+\})+\})+\}/,
        lookbehind: true,
        inside: {
          "format-spec": {
            pattern: /(:)[^:(){}]+(?=\}$)/,
            lookbehind: true
          },
          "conversion-option": {
            pattern: /![sra](?=[:}]$)/,
            alias: "punctuation"
          },
          rest: null
        }
      },
      string: /[\s\S]+/
    }
  },
  "triple-quoted-string": {
    pattern: /(?:[rub]|br|rb)?("""|''')[\s\S]*?\1/i,
    greedy: true,
    alias: "string"
  },
  string: {
    pattern: /(?:[rub]|br|rb)?("|')(?:\\.|(?!\1)[^\\\r\n])*\1/i,
    greedy: true
  },
  function: {
    pattern: /((?:^|\s)def[ \t]+)[a-zA-Z_]\w*(?=\s*\()/g,
    lookbehind: true
  },
  "class-name": {
    pattern: /(\bclass\s+)\w+/i,
    lookbehind: true
  },
  decorator: {
    pattern: /(^[\t ]*)@\w+(?:\.\w+)*/m,
    lookbehind: true,
    alias: ["annotation", "punctuation"],
    inside: {
      punctuation: /\./
    }
  },
  keyword: /\b(?:_(?=\s*:)|and|as|assert|async|await|break|case|class|continue|def|del|elif|else|except|exec|finally|for|from|global|if|import|in|is|lambda|match|nonlocal|not|or|pass|print|raise|return|try|while|with|yield)\b/,
  builtin: /\b(?:__import__|abs|all|any|apply|ascii|basestring|bin|bool|buffer|bytearray|bytes|callable|chr|classmethod|cmp|coerce|compile|complex|delattr|dict|dir|divmod|enumerate|eval|execfile|file|filter|float|format|frozenset|getattr|globals|hasattr|hash|help|hex|id|input|int|intern|isinstance|issubclass|iter|len|list|locals|long|map|max|memoryview|min|next|object|oct|open|ord|pow|property|range|raw_input|reduce|reload|repr|reversed|round|set|setattr|slice|sorted|staticmethod|str|sum|super|tuple|type|unichr|unicode|vars|xrange|zip)\b/,
  boolean: /\b(?:False|None|True)\b/,
  number: /\b0(?:b(?:_?[01])+|o(?:_?[0-7])+|x(?:_?[a-f0-9])+)\b|(?:\b\d+(?:_\d+)*(?:\.(?:\d+(?:_\d+)*)?)?|\B\.\d+(?:_\d+)*)(?:e[+-]?\d+(?:_\d+)*)?j?(?!\w)/i,
  operator: /[-+%=]=?|!=|:=|\*\*?=?|\/\/?=?|<[<=>]?|>[=>]?|[&|^~]/,
  punctuation: /[{}[\];(),.:]/
};
Prism.languages.python["string-interpolation"].inside["interpolation"].inside.rest = Prism.languages.python;
Prism.languages.py = Prism.languages.python;

// node_modules/prismjs/components/prism-ruby.js
(function(Prism2) {
  Prism2.languages.ruby = Prism2.languages.extend("clike", {
    comment: {
      pattern: /#.*|^=begin\s[\s\S]*?^=end/m,
      greedy: true
    },
    "class-name": {
      pattern: /(\b(?:class|module)\s+|\bcatch\s+\()[\w.\\]+|\b[A-Z_]\w*(?=\s*\.\s*new\b)/,
      lookbehind: true,
      inside: {
        punctuation: /[.\\]/
      }
    },
    keyword: /\b(?:BEGIN|END|alias|and|begin|break|case|class|def|define_method|defined|do|each|else|elsif|end|ensure|extend|for|if|in|include|module|new|next|nil|not|or|prepend|private|protected|public|raise|redo|require|rescue|retry|return|self|super|then|throw|undef|unless|until|when|while|yield)\b/,
    operator: /\.{2,3}|&\.|===|<?=>|[!=]?~|(?:&&|\|\||<<|>>|\*\*|[+\-*/%<>!^&|=])=?|[?:]/,
    punctuation: /[(){}[\].,;]/
  });
  Prism2.languages.insertBefore("ruby", "operator", {
    "double-colon": {
      pattern: /::/,
      alias: "punctuation"
    }
  });
  var interpolation = {
    pattern: /((?:^|[^\\])(?:\\{2})*)#\{(?:[^{}]|\{[^{}]*\})*\}/,
    lookbehind: true,
    inside: {
      content: {
        pattern: /^(#\{)[\s\S]+(?=\}$)/,
        lookbehind: true,
        inside: Prism2.languages.ruby
      },
      delimiter: {
        pattern: /^#\{|\}$/,
        alias: "punctuation"
      }
    }
  };
  delete Prism2.languages.ruby.function;
  var percentExpression = "(?:" + [
    /([^a-zA-Z0-9\s{(\[<=])(?:(?!\1)[^\\]|\\[\s\S])*\1/.source,
    /\((?:[^()\\]|\\[\s\S]|\((?:[^()\\]|\\[\s\S])*\))*\)/.source,
    /\{(?:[^{}\\]|\\[\s\S]|\{(?:[^{}\\]|\\[\s\S])*\})*\}/.source,
    /\[(?:[^\[\]\\]|\\[\s\S]|\[(?:[^\[\]\\]|\\[\s\S])*\])*\]/.source,
    /<(?:[^<>\\]|\\[\s\S]|<(?:[^<>\\]|\\[\s\S])*>)*>/.source
  ].join("|") + ")";
  var symbolName = /(?:"(?:\\.|[^"\\\r\n])*"|(?:\b[a-zA-Z_]\w*|[^\s\0-\x7F]+)[?!]?|\$.)/.source;
  Prism2.languages.insertBefore("ruby", "keyword", {
    "regex-literal": [
      {
        pattern: RegExp(/%r/.source + percentExpression + /[egimnosux]{0,6}/.source),
        greedy: true,
        inside: {
          interpolation,
          regex: /[\s\S]+/
        }
      },
      {
        pattern: /(^|[^/])\/(?!\/)(?:\[[^\r\n\]]+\]|\\.|[^[/\\\r\n])+\/[egimnosux]{0,6}(?=\s*(?:$|[\r\n,.;})#]))/,
        lookbehind: true,
        greedy: true,
        inside: {
          interpolation,
          regex: /[\s\S]+/
        }
      }
    ],
    variable: /[@$]+[a-zA-Z_]\w*(?:[?!]|\b)/,
    symbol: [
      {
        pattern: RegExp(/(^|[^:]):/.source + symbolName),
        lookbehind: true,
        greedy: true
      },
      {
        pattern: RegExp(/([\r\n{(,][ \t]*)/.source + symbolName + /(?=:(?!:))/.source),
        lookbehind: true,
        greedy: true
      }
    ],
    "method-definition": {
      pattern: /(\bdef\s+)\w+(?:\s*\.\s*\w+)?/,
      lookbehind: true,
      inside: {
        function: /\b\w+$/,
        keyword: /^self\b/,
        "class-name": /^\w+/,
        punctuation: /\./
      }
    }
  });
  Prism2.languages.insertBefore("ruby", "string", {
    "string-literal": [
      {
        pattern: RegExp(/%[qQiIwWs]?/.source + percentExpression),
        greedy: true,
        inside: {
          interpolation,
          string: /[\s\S]+/
        }
      },
      {
        pattern: /("|')(?:#\{[^}]+\}|#(?!\{)|\\(?:\r\n|[\s\S])|(?!\1)[^\\#\r\n])*\1/,
        greedy: true,
        inside: {
          interpolation,
          string: /[\s\S]+/
        }
      },
      {
        pattern: /<<[-~]?([a-z_]\w*)[\r\n](?:.*[\r\n])*?[\t ]*\1/i,
        alias: "heredoc-string",
        greedy: true,
        inside: {
          delimiter: {
            pattern: /^<<[-~]?[a-z_]\w*|\b[a-z_]\w*$/i,
            inside: {
              symbol: /\b\w+/,
              punctuation: /^<<[-~]?/
            }
          },
          interpolation,
          string: /[\s\S]+/
        }
      },
      {
        pattern: /<<[-~]?'([a-z_]\w*)'[\r\n](?:.*[\r\n])*?[\t ]*\1/i,
        alias: "heredoc-string",
        greedy: true,
        inside: {
          delimiter: {
            pattern: /^<<[-~]?'[a-z_]\w*'|\b[a-z_]\w*$/i,
            inside: {
              symbol: /\b\w+/,
              punctuation: /^<<[-~]?'|'$/
            }
          },
          string: /[\s\S]+/
        }
      }
    ],
    "command-literal": [
      {
        pattern: RegExp(/%x/.source + percentExpression),
        greedy: true,
        inside: {
          interpolation,
          command: {
            pattern: /[\s\S]+/,
            alias: "string"
          }
        }
      },
      {
        pattern: /`(?:#\{[^}]+\}|#(?!\{)|\\(?:\r\n|[\s\S])|[^\\`#\r\n])*`/,
        greedy: true,
        inside: {
          interpolation,
          command: {
            pattern: /[\s\S]+/,
            alias: "string"
          }
        }
      }
    ]
  });
  delete Prism2.languages.ruby.string;
  Prism2.languages.insertBefore("ruby", "number", {
    builtin: /\b(?:Array|Bignum|Binding|Class|Continuation|Dir|Exception|FalseClass|File|Fixnum|Float|Hash|IO|Integer|MatchData|Method|Module|NilClass|Numeric|Object|Proc|Range|Regexp|Stat|String|Struct|Symbol|TMS|Thread|ThreadGroup|Time|TrueClass)\b/,
    constant: /\b[A-Z][A-Z0-9_]*(?:[?!]|\b)/
  });
  Prism2.languages.rb = Prism2.languages.ruby;
})(Prism);

// node_modules/prismjs/components/prism-bash.js
(function(Prism2) {
  var envVars = "\\b(?:BASH|BASHOPTS|BASH_ALIASES|BASH_ARGC|BASH_ARGV|BASH_CMDS|BASH_COMPLETION_COMPAT_DIR|BASH_LINENO|BASH_REMATCH|BASH_SOURCE|BASH_VERSINFO|BASH_VERSION|COLORTERM|COLUMNS|COMP_WORDBREAKS|DBUS_SESSION_BUS_ADDRESS|DEFAULTS_PATH|DESKTOP_SESSION|DIRSTACK|DISPLAY|EUID|GDMSESSION|GDM_LANG|GNOME_KEYRING_CONTROL|GNOME_KEYRING_PID|GPG_AGENT_INFO|GROUPS|HISTCONTROL|HISTFILE|HISTFILESIZE|HISTSIZE|HOME|HOSTNAME|HOSTTYPE|IFS|INSTANCE|JOB|LANG|LANGUAGE|LC_ADDRESS|LC_ALL|LC_IDENTIFICATION|LC_MEASUREMENT|LC_MONETARY|LC_NAME|LC_NUMERIC|LC_PAPER|LC_TELEPHONE|LC_TIME|LESSCLOSE|LESSOPEN|LINES|LOGNAME|LS_COLORS|MACHTYPE|MAILCHECK|MANDATORY_PATH|NO_AT_BRIDGE|OLDPWD|OPTERR|OPTIND|ORBIT_SOCKETDIR|OSTYPE|PAPERSIZE|PATH|PIPESTATUS|PPID|PS1|PS2|PS3|PS4|PWD|RANDOM|REPLY|SECONDS|SELINUX_INIT|SESSION|SESSIONTYPE|SESSION_MANAGER|SHELL|SHELLOPTS|SHLVL|SSH_AUTH_SOCK|TERM|UID|UPSTART_EVENTS|UPSTART_INSTANCE|UPSTART_JOB|UPSTART_SESSION|USER|WINDOWID|XAUTHORITY|XDG_CONFIG_DIRS|XDG_CURRENT_DESKTOP|XDG_DATA_DIRS|XDG_GREETER_DATA_DIR|XDG_MENU_PREFIX|XDG_RUNTIME_DIR|XDG_SEAT|XDG_SEAT_PATH|XDG_SESSION_DESKTOP|XDG_SESSION_ID|XDG_SESSION_PATH|XDG_SESSION_TYPE|XDG_VTNR|XMODIFIERS)\\b";
  var commandAfterHeredoc = {
    pattern: /(^(["']?)\w+\2)[ \t]+\S.*/,
    lookbehind: true,
    alias: "punctuation",
    inside: null
  };
  var insideString = {
    bash: commandAfterHeredoc,
    environment: {
      pattern: RegExp("\\$" + envVars),
      alias: "constant"
    },
    variable: [
      {
        pattern: /\$?\(\([\s\S]+?\)\)/,
        greedy: true,
        inside: {
          variable: [
            {
              pattern: /(^\$\(\([\s\S]+)\)\)/,
              lookbehind: true
            },
            /^\$\(\(/
          ],
          number: /\b0x[\dA-Fa-f]+\b|(?:\b\d+(?:\.\d*)?|\B\.\d+)(?:[Ee]-?\d+)?/,
          operator: /--|\+\+|\*\*=?|<<=?|>>=?|&&|\|\||[=!+\-*/%<>^&|]=?|[?~:]/,
          punctuation: /\(\(?|\)\)?|,|;/
        }
      },
      {
        pattern: /\$\((?:\([^)]+\)|[^()])+\)|`[^`]+`/,
        greedy: true,
        inside: {
          variable: /^\$\(|^`|\)$|`$/
        }
      },
      {
        pattern: /\$\{[^}]+\}/,
        greedy: true,
        inside: {
          operator: /:[-=?+]?|[!\/]|##?|%%?|\^\^?|,,?/,
          punctuation: /[\[\]]/,
          environment: {
            pattern: RegExp("(\\{)" + envVars),
            lookbehind: true,
            alias: "constant"
          }
        }
      },
      /\$(?:\w+|[#?*!@$])/
    ],
    entity: /\\(?:[abceEfnrtv\\"]|O?[0-7]{1,3}|U[0-9a-fA-F]{8}|u[0-9a-fA-F]{4}|x[0-9a-fA-F]{1,2})/
  };
  Prism2.languages.bash = {
    shebang: {
      pattern: /^#!\s*\/.*/,
      alias: "important"
    },
    comment: {
      pattern: /(^|[^"{\\$])#.*/,
      lookbehind: true
    },
    "function-name": [
      {
        pattern: /(\bfunction\s+)[\w-]+(?=(?:\s*\(?:\s*\))?\s*\{)/,
        lookbehind: true,
        alias: "function"
      },
      {
        pattern: /\b[\w-]+(?=\s*\(\s*\)\s*\{)/,
        alias: "function"
      }
    ],
    "for-or-select": {
      pattern: /(\b(?:for|select)\s+)\w+(?=\s+in\s)/,
      alias: "variable",
      lookbehind: true
    },
    "assign-left": {
      pattern: /(^|[\s;|&]|[<>]\()\w+(?:\.\w+)*(?=\+?=)/,
      inside: {
        environment: {
          pattern: RegExp("(^|[\\s;|&]|[<>]\\()" + envVars),
          lookbehind: true,
          alias: "constant"
        }
      },
      alias: "variable",
      lookbehind: true
    },
    parameter: {
      pattern: /(^|\s)-{1,2}(?:\w+:[+-]?)?\w+(?:\.\w+)*(?=[=\s]|$)/,
      alias: "variable",
      lookbehind: true
    },
    string: [
      {
        pattern: /((?:^|[^<])<<-?\s*)(\w+)\s[\s\S]*?(?:\r?\n|\r)\2/,
        lookbehind: true,
        greedy: true,
        inside: insideString
      },
      {
        pattern: /((?:^|[^<])<<-?\s*)(["'])(\w+)\2\s[\s\S]*?(?:\r?\n|\r)\3/,
        lookbehind: true,
        greedy: true,
        inside: {
          bash: commandAfterHeredoc
        }
      },
      {
        pattern: /(^|[^\\](?:\\\\)*)"(?:\\[\s\S]|\$\([^)]+\)|\$(?!\()|`[^`]+`|[^"\\`$])*"/,
        lookbehind: true,
        greedy: true,
        inside: insideString
      },
      {
        pattern: /(^|[^$\\])'[^']*'/,
        lookbehind: true,
        greedy: true
      },
      {
        pattern: /\$'(?:[^'\\]|\\[\s\S])*'/,
        greedy: true,
        inside: {
          entity: insideString.entity
        }
      }
    ],
    environment: {
      pattern: RegExp("\\$?" + envVars),
      alias: "constant"
    },
    variable: insideString.variable,
    function: {
      pattern: /(^|[\s;|&]|[<>]\()(?:add|apropos|apt|apt-cache|apt-get|aptitude|aspell|automysqlbackup|awk|basename|bash|bc|bconsole|bg|bzip2|cal|cargo|cat|cfdisk|chgrp|chkconfig|chmod|chown|chroot|cksum|clear|cmp|column|comm|composer|cp|cron|crontab|csplit|curl|cut|date|dc|dd|ddrescue|debootstrap|df|diff|diff3|dig|dir|dircolors|dirname|dirs|dmesg|docker|docker-compose|du|egrep|eject|env|ethtool|expand|expect|expr|fdformat|fdisk|fg|fgrep|file|find|fmt|fold|format|free|fsck|ftp|fuser|gawk|git|gparted|grep|groupadd|groupdel|groupmod|groups|grub-mkconfig|gzip|halt|head|hg|history|host|hostname|htop|iconv|id|ifconfig|ifdown|ifup|import|install|ip|java|jobs|join|kill|killall|less|link|ln|locate|logname|logrotate|look|lpc|lpr|lprint|lprintd|lprintq|lprm|ls|lsof|lynx|make|man|mc|mdadm|mkconfig|mkdir|mke2fs|mkfifo|mkfs|mkisofs|mknod|mkswap|mmv|more|most|mount|mtools|mtr|mutt|mv|nano|nc|netstat|nice|nl|node|nohup|notify-send|npm|nslookup|op|open|parted|passwd|paste|pathchk|ping|pkill|pnpm|podman|podman-compose|popd|pr|printcap|printenv|ps|pushd|pv|quota|quotacheck|quotactl|ram|rar|rcp|reboot|remsync|rename|renice|rev|rm|rmdir|rpm|rsync|scp|screen|sdiff|sed|sendmail|seq|service|sftp|sh|shellcheck|shuf|shutdown|sleep|slocate|sort|split|ssh|stat|strace|su|sudo|sum|suspend|swapon|sync|sysctl|tac|tail|tar|tee|time|timeout|top|touch|tr|traceroute|tsort|tty|umount|uname|unexpand|uniq|units|unrar|unshar|unzip|update-grub|uptime|useradd|userdel|usermod|users|uudecode|uuencode|v|vcpkg|vdir|vi|vim|virsh|vmstat|wait|watch|wc|wget|whereis|which|who|whoami|write|xargs|xdg-open|yarn|yes|zenity|zip|zsh|zypper)(?=$|[)\s;|&])/,
      lookbehind: true
    },
    keyword: {
      pattern: /(^|[\s;|&]|[<>]\()(?:case|do|done|elif|else|esac|fi|for|function|if|in|select|then|until|while)(?=$|[)\s;|&])/,
      lookbehind: true
    },
    builtin: {
      pattern: /(^|[\s;|&]|[<>]\()(?:\.|:|alias|bind|break|builtin|caller|cd|command|continue|declare|echo|enable|eval|exec|exit|export|getopts|hash|help|let|local|logout|mapfile|printf|pwd|read|readarray|readonly|return|set|shift|shopt|source|test|times|trap|type|typeset|ulimit|umask|unalias|unset)(?=$|[)\s;|&])/,
      lookbehind: true,
      alias: "class-name"
    },
    boolean: {
      pattern: /(^|[\s;|&]|[<>]\()(?:false|true)(?=$|[)\s;|&])/,
      lookbehind: true
    },
    "file-descriptor": {
      pattern: /\B&\d\b/,
      alias: "important"
    },
    operator: {
      pattern: /\d?<>|>\||\+=|=[=~]?|!=?|<<[<-]?|[&\d]?>>|\d[<>]&?|[<>][&=]?|&[>&]?|\|[&|]?/,
      inside: {
        "file-descriptor": {
          pattern: /^\d/,
          alias: "important"
        }
      }
    },
    punctuation: /\$?\(\(?|\)\)?|\.\.|[{}[\];\\]/,
    number: {
      pattern: /(^|\s)(?:[1-9]\d*|0)(?:[.,]\d+)?\b/,
      lookbehind: true
    }
  };
  commandAfterHeredoc.inside = Prism2.languages.bash;
  var toBeCopied = [
    "comment",
    "function-name",
    "for-or-select",
    "assign-left",
    "parameter",
    "string",
    "environment",
    "function",
    "keyword",
    "builtin",
    "boolean",
    "file-descriptor",
    "operator",
    "punctuation",
    "number"
  ];
  var inside = insideString.variable[1].inside;
  for (var i = 0;i < toBeCopied.length; i++) {
    inside[toBeCopied[i]] = Prism2.languages.bash[toBeCopied[i]];
  }
  Prism2.languages.sh = Prism2.languages.bash;
  Prism2.languages.shell = Prism2.languages.bash;
})(Prism);

// node_modules/prismjs/components/prism-json.js
Prism.languages.json = {
  property: {
    pattern: /(^|[^\\])"(?:\\.|[^\\"\r\n])*"(?=\s*:)/,
    lookbehind: true,
    greedy: true
  },
  string: {
    pattern: /(^|[^\\])"(?:\\.|[^\\"\r\n])*"(?!\s*:)/,
    lookbehind: true,
    greedy: true
  },
  comment: {
    pattern: /\/\/.*|\/\*[\s\S]*?(?:\*\/|$)/,
    greedy: true
  },
  number: /-?\b\d+(?:\.\d+)?(?:e[+-]?\d+)?\b/i,
  punctuation: /[{}[\],]/,
  operator: /:/,
  boolean: /\b(?:false|true)\b/,
  null: {
    pattern: /\bnull\b/,
    alias: "keyword"
  }
};
Prism.languages.webmanifest = Prism.languages.json;

// node_modules/prismjs/components/prism-yaml.js
(function(Prism2) {
  var anchorOrAlias = /[*&][^\s[\]{},]+/;
  var tag = /!(?:<[\w\-%#;/?:@&=+$,.!~*'()[\]]+>|(?:[a-zA-Z\d-]*!)?[\w\-%#;/?:@&=+$.~*'()]+)?/;
  var properties = "(?:" + tag.source + "(?:[ \t]+" + anchorOrAlias.source + ")?|" + anchorOrAlias.source + "(?:[ \t]+" + tag.source + ")?)";
  var plainKey = /(?:[^\s\x00-\x08\x0e-\x1f!"#%&'*,\-:>?@[\]`{|}\x7f-\x84\x86-\x9f\ud800-\udfff\ufffe\uffff]|[?:-]<PLAIN>)(?:[ \t]*(?:(?![#:])<PLAIN>|:<PLAIN>))*/.source.replace(/<PLAIN>/g, function() {
    return /[^\s\x00-\x08\x0e-\x1f,[\]{}\x7f-\x84\x86-\x9f\ud800-\udfff\ufffe\uffff]/.source;
  });
  var string = /"(?:[^"\\\r\n]|\\.)*"|'(?:[^'\\\r\n]|\\.)*'/.source;
  function createValuePattern(value, flags) {
    flags = (flags || "").replace(/m/g, "") + "m";
    var pattern = /([:\-,[{]\s*(?:\s<<prop>>[ \t]+)?)(?:<<value>>)(?=[ \t]*(?:$|,|\]|\}|(?:[\r\n]\s*)?#))/.source.replace(/<<prop>>/g, function() {
      return properties;
    }).replace(/<<value>>/g, function() {
      return value;
    });
    return RegExp(pattern, flags);
  }
  Prism2.languages.yaml = {
    scalar: {
      pattern: RegExp(/([\-:]\s*(?:\s<<prop>>[ \t]+)?[|>])[ \t]*(?:((?:\r?\n|\r)[ \t]+)\S[^\r\n]*(?:\2[^\r\n]+)*)/.source.replace(/<<prop>>/g, function() {
        return properties;
      })),
      lookbehind: true,
      alias: "string"
    },
    comment: /#.*/,
    key: {
      pattern: RegExp(/((?:^|[:\-,[{\r\n?])[ \t]*(?:<<prop>>[ \t]+)?)<<key>>(?=\s*:\s)/.source.replace(/<<prop>>/g, function() {
        return properties;
      }).replace(/<<key>>/g, function() {
        return "(?:" + plainKey + "|" + string + ")";
      })),
      lookbehind: true,
      greedy: true,
      alias: "atrule"
    },
    directive: {
      pattern: /(^[ \t]*)%.+/m,
      lookbehind: true,
      alias: "important"
    },
    datetime: {
      pattern: createValuePattern(/\d{4}-\d\d?-\d\d?(?:[tT]|[ \t]+)\d\d?:\d{2}:\d{2}(?:\.\d*)?(?:[ \t]*(?:Z|[-+]\d\d?(?::\d{2})?))?|\d{4}-\d{2}-\d{2}|\d\d?:\d{2}(?::\d{2}(?:\.\d*)?)?/.source),
      lookbehind: true,
      alias: "number"
    },
    boolean: {
      pattern: createValuePattern(/false|true/.source, "i"),
      lookbehind: true,
      alias: "important"
    },
    null: {
      pattern: createValuePattern(/null|~/.source, "i"),
      lookbehind: true,
      alias: "important"
    },
    string: {
      pattern: createValuePattern(string),
      lookbehind: true,
      greedy: true
    },
    number: {
      pattern: createValuePattern(/[+-]?(?:0x[\da-f]+|0o[0-7]+|(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?|\.inf|\.nan)/.source, "i"),
      lookbehind: true
    },
    tag,
    important: anchorOrAlias,
    punctuation: /---|[:[\]{}\-,|>?]|\.\.\./
  };
  Prism2.languages.yml = Prism2.languages.yaml;
})(Prism);

// node_modules/prismjs/components/prism-markdown.js
(function(Prism2) {
  var inner = /(?:\\.|[^\\\n\r]|(?:\n|\r\n?)(?![\r\n]))/.source;
  function createInline(pattern) {
    pattern = pattern.replace(/<inner>/g, function() {
      return inner;
    });
    return RegExp(/((?:^|[^\\])(?:\\{2})*)/.source + "(?:" + pattern + ")");
  }
  var tableCell = /(?:\\.|``(?:[^`\r\n]|`(?!`))+``|`[^`\r\n]+`|[^\\|\r\n`])+/.source;
  var tableRow = /\|?__(?:\|__)+\|?(?:(?:\n|\r\n?)|(?![\s\S]))/.source.replace(/__/g, function() {
    return tableCell;
  });
  var tableLine = /\|?[ \t]*:?-{3,}:?[ \t]*(?:\|[ \t]*:?-{3,}:?[ \t]*)+\|?(?:\n|\r\n?)/.source;
  Prism2.languages.markdown = Prism2.languages.extend("markup", {});
  Prism2.languages.insertBefore("markdown", "prolog", {
    "front-matter-block": {
      pattern: /(^(?:\s*[\r\n])?)---(?!.)[\s\S]*?[\r\n]---(?!.)/,
      lookbehind: true,
      greedy: true,
      inside: {
        punctuation: /^---|---$/,
        "front-matter": {
          pattern: /\S+(?:\s+\S+)*/,
          alias: ["yaml", "language-yaml"],
          inside: Prism2.languages.yaml
        }
      }
    },
    blockquote: {
      pattern: /^>(?:[\t ]*>)*/m,
      alias: "punctuation"
    },
    table: {
      pattern: RegExp("^" + tableRow + tableLine + "(?:" + tableRow + ")*", "m"),
      inside: {
        "table-data-rows": {
          pattern: RegExp("^(" + tableRow + tableLine + ")(?:" + tableRow + ")*$"),
          lookbehind: true,
          inside: {
            "table-data": {
              pattern: RegExp(tableCell),
              inside: Prism2.languages.markdown
            },
            punctuation: /\|/
          }
        },
        "table-line": {
          pattern: RegExp("^(" + tableRow + ")" + tableLine + "$"),
          lookbehind: true,
          inside: {
            punctuation: /\||:?-{3,}:?/
          }
        },
        "table-header-row": {
          pattern: RegExp("^" + tableRow + "$"),
          inside: {
            "table-header": {
              pattern: RegExp(tableCell),
              alias: "important",
              inside: Prism2.languages.markdown
            },
            punctuation: /\|/
          }
        }
      }
    },
    code: [
      {
        pattern: /((?:^|\n)[ \t]*\n|(?:^|\r\n?)[ \t]*\r\n?)(?: {4}|\t).+(?:(?:\n|\r\n?)(?: {4}|\t).+)*/,
        lookbehind: true,
        alias: "keyword"
      },
      {
        pattern: /^```[\s\S]*?^```$/m,
        greedy: true,
        inside: {
          "code-block": {
            pattern: /^(```.*(?:\n|\r\n?))[\s\S]+?(?=(?:\n|\r\n?)^```$)/m,
            lookbehind: true
          },
          "code-language": {
            pattern: /^(```).+/,
            lookbehind: true
          },
          punctuation: /```/
        }
      }
    ],
    title: [
      {
        pattern: /\S.*(?:\n|\r\n?)(?:==+|--+)(?=[ \t]*$)/m,
        alias: "important",
        inside: {
          punctuation: /==+$|--+$/
        }
      },
      {
        pattern: /(^\s*)#.+/m,
        lookbehind: true,
        alias: "important",
        inside: {
          punctuation: /^#+|#+$/
        }
      }
    ],
    hr: {
      pattern: /(^\s*)([*-])(?:[\t ]*\2){2,}(?=\s*$)/m,
      lookbehind: true,
      alias: "punctuation"
    },
    list: {
      pattern: /(^\s*)(?:[*+-]|\d+\.)(?=[\t ].)/m,
      lookbehind: true,
      alias: "punctuation"
    },
    "url-reference": {
      pattern: /!?\[[^\]]+\]:[\t ]+(?:\S+|<(?:\\.|[^>\\])+>)(?:[\t ]+(?:"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|\((?:\\.|[^)\\])*\)))?/,
      inside: {
        variable: {
          pattern: /^(!?\[)[^\]]+/,
          lookbehind: true
        },
        string: /(?:"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|\((?:\\.|[^)\\])*\))$/,
        punctuation: /^[\[\]!:]|[<>]/
      },
      alias: "url"
    },
    bold: {
      pattern: createInline(/\b__(?:(?!_)<inner>|_(?:(?!_)<inner>)+_)+__\b|\*\*(?:(?!\*)<inner>|\*(?:(?!\*)<inner>)+\*)+\*\*/.source),
      lookbehind: true,
      greedy: true,
      inside: {
        content: {
          pattern: /(^..)[\s\S]+(?=..$)/,
          lookbehind: true,
          inside: {}
        },
        punctuation: /\*\*|__/
      }
    },
    italic: {
      pattern: createInline(/\b_(?:(?!_)<inner>|__(?:(?!_)<inner>)+__)+_\b|\*(?:(?!\*)<inner>|\*\*(?:(?!\*)<inner>)+\*\*)+\*/.source),
      lookbehind: true,
      greedy: true,
      inside: {
        content: {
          pattern: /(^.)[\s\S]+(?=.$)/,
          lookbehind: true,
          inside: {}
        },
        punctuation: /[*_]/
      }
    },
    strike: {
      pattern: createInline(/(~~?)(?:(?!~)<inner>)+\2/.source),
      lookbehind: true,
      greedy: true,
      inside: {
        content: {
          pattern: /(^~~?)[\s\S]+(?=\1$)/,
          lookbehind: true,
          inside: {}
        },
        punctuation: /~~?/
      }
    },
    "code-snippet": {
      pattern: /(^|[^\\`])(?:``[^`\r\n]+(?:`[^`\r\n]+)*``(?!`)|`[^`\r\n]+`(?!`))/,
      lookbehind: true,
      greedy: true,
      alias: ["code", "keyword"]
    },
    url: {
      pattern: createInline(/!?\[(?:(?!\])<inner>)+\](?:\([^\s)]+(?:[\t ]+"(?:\\.|[^"\\])*")?\)|[ \t]?\[(?:(?!\])<inner>)+\])/.source),
      lookbehind: true,
      greedy: true,
      inside: {
        operator: /^!/,
        content: {
          pattern: /(^\[)[^\]]+(?=\])/,
          lookbehind: true,
          inside: {}
        },
        variable: {
          pattern: /(^\][ \t]?\[)[^\]]+(?=\]$)/,
          lookbehind: true
        },
        url: {
          pattern: /(^\]\()[^\s)]+/,
          lookbehind: true
        },
        string: {
          pattern: /(^[ \t]+)"(?:\\.|[^"\\])*"(?=\)$)/,
          lookbehind: true
        }
      }
    }
  });
  ["url", "bold", "italic", "strike"].forEach(function(token) {
    ["url", "bold", "italic", "strike", "code-snippet"].forEach(function(inside) {
      if (token !== inside) {
        Prism2.languages.markdown[token].inside.content.inside[inside] = Prism2.languages.markdown[inside];
      }
    });
  });
  Prism2.hooks.add("after-tokenize", function(env) {
    if (env.language !== "markdown" && env.language !== "md") {
      return;
    }
    function walkTokens(tokens) {
      if (!tokens || typeof tokens === "string") {
        return;
      }
      for (var i = 0, l = tokens.length;i < l; i++) {
        var token = tokens[i];
        if (token.type !== "code") {
          walkTokens(token.content);
          continue;
        }
        var codeLang = token.content[1];
        var codeBlock = token.content[3];
        if (codeLang && codeBlock && codeLang.type === "code-language" && codeBlock.type === "code-block" && typeof codeLang.content === "string") {
          var lang = codeLang.content.replace(/\b#/g, "sharp").replace(/\b\+\+/g, "pp");
          lang = (/[a-z][\w-]*/i.exec(lang) || [""])[0].toLowerCase();
          var alias = "language-" + lang;
          if (!codeBlock.alias) {
            codeBlock.alias = [alias];
          } else if (typeof codeBlock.alias === "string") {
            codeBlock.alias = [codeBlock.alias, alias];
          } else {
            codeBlock.alias.push(alias);
          }
        }
      }
    }
    walkTokens(env.tokens);
  });
  Prism2.hooks.add("wrap", function(env) {
    if (env.type !== "code-block") {
      return;
    }
    var codeLang = "";
    for (var i = 0, l = env.classes.length;i < l; i++) {
      var cls = env.classes[i];
      var match = /language-(.+)/.exec(cls);
      if (match) {
        codeLang = match[1];
        break;
      }
    }
    var grammar = Prism2.languages[codeLang];
    if (!grammar) {
      if (codeLang && codeLang !== "none" && Prism2.plugins.autoloader) {
        var id = "md-" + new Date().valueOf() + "-" + Math.floor(Math.random() * 10000000000000000);
        env.attributes["id"] = id;
        Prism2.plugins.autoloader.loadLanguages(codeLang, function() {
          var ele = document.getElementById(id);
          if (ele) {
            ele.innerHTML = Prism2.highlight(ele.textContent, Prism2.languages[codeLang], codeLang);
          }
        });
      }
    } else {
      env.content = Prism2.highlight(textContent(env.content), grammar, codeLang);
    }
  });
  var tagPattern = RegExp(Prism2.languages.markup.tag.pattern.source, "gi");
  var KNOWN_ENTITY_NAMES = {
    amp: "&",
    lt: "<",
    gt: ">",
    quot: '"'
  };
  var fromCodePoint = String.fromCodePoint || String.fromCharCode;
  function textContent(html) {
    var text = html.replace(tagPattern, "");
    text = text.replace(/&(\w{1,8}|#x?[\da-f]{1,8});/gi, function(m, code) {
      code = code.toLowerCase();
      if (code[0] === "#") {
        var value;
        if (code[1] === "x") {
          value = parseInt(code.slice(2), 16);
        } else {
          value = Number(code.slice(1));
        }
        return fromCodePoint(value);
      } else {
        var known = KNOWN_ENTITY_NAMES[code];
        if (known) {
          return known;
        }
        return m;
      }
    });
    return text;
  }
  Prism2.languages.md = Prism2.languages.markdown;
})(Prism);

// node_modules/prismjs/components/prism-css.js
(function(Prism2) {
  var string = /(?:"(?:\\(?:\r\n|[\s\S])|[^"\\\r\n])*"|'(?:\\(?:\r\n|[\s\S])|[^'\\\r\n])*')/;
  Prism2.languages.css = {
    comment: /\/\*[\s\S]*?\*\//,
    atrule: {
      pattern: RegExp("@[\\w-](?:" + /[^;{\s"']|\s+(?!\s)/.source + "|" + string.source + ")*?" + /(?:;|(?=\s*\{))/.source),
      inside: {
        rule: /^@[\w-]+/,
        "selector-function-argument": {
          pattern: /(\bselector\s*\(\s*(?![\s)]))(?:[^()\s]|\s+(?![\s)])|\((?:[^()]|\([^()]*\))*\))+(?=\s*\))/,
          lookbehind: true,
          alias: "selector"
        },
        keyword: {
          pattern: /(^|[^\w-])(?:and|not|only|or)(?![\w-])/,
          lookbehind: true
        }
      }
    },
    url: {
      pattern: RegExp("\\burl\\((?:" + string.source + "|" + /(?:[^\\\r\n()"']|\\[\s\S])*/.source + ")\\)", "i"),
      greedy: true,
      inside: {
        function: /^url/i,
        punctuation: /^\(|\)$/,
        string: {
          pattern: RegExp("^" + string.source + "$"),
          alias: "url"
        }
      }
    },
    selector: {
      pattern: RegExp(`(^|[{}\\s])[^{}\\s](?:[^{};"'\\s]|\\s+(?![\\s{])|` + string.source + ")*(?=\\s*\\{)"),
      lookbehind: true
    },
    string: {
      pattern: string,
      greedy: true
    },
    property: {
      pattern: /(^|[^-\w\xA0-\uFFFF])(?!\s)[-_a-z\xA0-\uFFFF](?:(?!\s)[-\w\xA0-\uFFFF])*(?=\s*:)/i,
      lookbehind: true
    },
    important: /!important\b/i,
    function: {
      pattern: /(^|[^-a-z0-9])[-a-z0-9]+(?=\()/i,
      lookbehind: true
    },
    punctuation: /[(){};:,]/
  };
  Prism2.languages.css["atrule"].inside.rest = Prism2.languages.css;
  var markup = Prism2.languages.markup;
  if (markup) {
    markup.tag.addInlined("style", "css");
    markup.tag.addAttribute("style", "css");
  }
})(Prism);

// node_modules/prismjs/components/prism-sql.js
Prism.languages.sql = {
  comment: {
    pattern: /(^|[^\\])(?:\/\*[\s\S]*?\*\/|(?:--|\/\/|#).*)/,
    lookbehind: true
  },
  variable: [
    {
      pattern: /@(["'`])(?:\\[\s\S]|(?!\1)[^\\])+\1/,
      greedy: true
    },
    /@[\w.$]+/
  ],
  string: {
    pattern: /(^|[^@\\])("|')(?:\\[\s\S]|(?!\2)[^\\]|\2\2)*\2/,
    greedy: true,
    lookbehind: true
  },
  identifier: {
    pattern: /(^|[^@\\])`(?:\\[\s\S]|[^`\\]|``)*`/,
    greedy: true,
    lookbehind: true,
    inside: {
      punctuation: /^`|`$/
    }
  },
  function: /\b(?:AVG|COUNT|FIRST|FORMAT|LAST|LCASE|LEN|MAX|MID|MIN|MOD|NOW|ROUND|SUM|UCASE)(?=\s*\()/i,
  keyword: /\b(?:ACTION|ADD|AFTER|ALGORITHM|ALL|ALTER|ANALYZE|ANY|APPLY|AS|ASC|AUTHORIZATION|AUTO_INCREMENT|BACKUP|BDB|BEGIN|BERKELEYDB|BIGINT|BINARY|BIT|BLOB|BOOL|BOOLEAN|BREAK|BROWSE|BTREE|BULK|BY|CALL|CASCADED?|CASE|CHAIN|CHAR(?:ACTER|SET)?|CHECK(?:POINT)?|CLOSE|CLUSTERED|COALESCE|COLLATE|COLUMNS?|COMMENT|COMMIT(?:TED)?|COMPUTE|CONNECT|CONSISTENT|CONSTRAINT|CONTAINS(?:TABLE)?|CONTINUE|CONVERT|CREATE|CROSS|CURRENT(?:_DATE|_TIME|_TIMESTAMP|_USER)?|CURSOR|CYCLE|DATA(?:BASES?)?|DATE(?:TIME)?|DAY|DBCC|DEALLOCATE|DEC|DECIMAL|DECLARE|DEFAULT|DEFINER|DELAYED|DELETE|DELIMITERS?|DENY|DESC|DESCRIBE|DETERMINISTIC|DISABLE|DISCARD|DISK|DISTINCT|DISTINCTROW|DISTRIBUTED|DO|DOUBLE|DROP|DUMMY|DUMP(?:FILE)?|DUPLICATE|ELSE(?:IF)?|ENABLE|ENCLOSED|END|ENGINE|ENUM|ERRLVL|ERRORS|ESCAPED?|EXCEPT|EXEC(?:UTE)?|EXISTS|EXIT|EXPLAIN|EXTENDED|FETCH|FIELDS|FILE|FILLFACTOR|FIRST|FIXED|FLOAT|FOLLOWING|FOR(?: EACH ROW)?|FORCE|FOREIGN|FREETEXT(?:TABLE)?|FROM|FULL|FUNCTION|GEOMETRY(?:COLLECTION)?|GLOBAL|GOTO|GRANT|GROUP|HANDLER|HASH|HAVING|HOLDLOCK|HOUR|IDENTITY(?:COL|_INSERT)?|IF|IGNORE|IMPORT|INDEX|INFILE|INNER|INNODB|INOUT|INSERT|INT|INTEGER|INTERSECT|INTERVAL|INTO|INVOKER|ISOLATION|ITERATE|JOIN|KEYS?|KILL|LANGUAGE|LAST|LEAVE|LEFT|LEVEL|LIMIT|LINENO|LINES|LINESTRING|LOAD|LOCAL|LOCK|LONG(?:BLOB|TEXT)|LOOP|MATCH(?:ED)?|MEDIUM(?:BLOB|INT|TEXT)|MERGE|MIDDLEINT|MINUTE|MODE|MODIFIES|MODIFY|MONTH|MULTI(?:LINESTRING|POINT|POLYGON)|NATIONAL|NATURAL|NCHAR|NEXT|NO|NONCLUSTERED|NULLIF|NUMERIC|OFF?|OFFSETS?|ON|OPEN(?:DATASOURCE|QUERY|ROWSET)?|OPTIMIZE|OPTION(?:ALLY)?|ORDER|OUT(?:ER|FILE)?|OVER|PARTIAL|PARTITION|PERCENT|PIVOT|PLAN|POINT|POLYGON|PRECEDING|PRECISION|PREPARE|PREV|PRIMARY|PRINT|PRIVILEGES|PROC(?:EDURE)?|PUBLIC|PURGE|QUICK|RAISERROR|READS?|REAL|RECONFIGURE|REFERENCES|RELEASE|RENAME|REPEAT(?:ABLE)?|REPLACE|REPLICATION|REQUIRE|RESIGNAL|RESTORE|RESTRICT|RETURN(?:ING|S)?|REVOKE|RIGHT|ROLLBACK|ROUTINE|ROW(?:COUNT|GUIDCOL|S)?|RTREE|RULE|SAVE(?:POINT)?|SCHEMA|SECOND|SELECT|SERIAL(?:IZABLE)?|SESSION(?:_USER)?|SET(?:USER)?|SHARE|SHOW|SHUTDOWN|SIMPLE|SMALLINT|SNAPSHOT|SOME|SONAME|SQL|START(?:ING)?|STATISTICS|STATUS|STRIPED|SYSTEM_USER|TABLES?|TABLESPACE|TEMP(?:ORARY|TABLE)?|TERMINATED|TEXT(?:SIZE)?|THEN|TIME(?:STAMP)?|TINY(?:BLOB|INT|TEXT)|TOP?|TRAN(?:SACTIONS?)?|TRIGGER|TRUNCATE|TSEQUAL|TYPES?|UNBOUNDED|UNCOMMITTED|UNDEFINED|UNION|UNIQUE|UNLOCK|UNPIVOT|UNSIGNED|UPDATE(?:TEXT)?|USAGE|USE|USER|USING|VALUES?|VAR(?:BINARY|CHAR|CHARACTER|YING)|VIEW|WAITFOR|WARNINGS|WHEN|WHERE|WHILE|WITH(?: ROLLUP|IN)?|WORK|WRITE(?:TEXT)?|YEAR)\b/i,
  boolean: /\b(?:FALSE|NULL|TRUE)\b/i,
  number: /\b0x[\da-f]+\b|\b\d+(?:\.\d*)?|\B\.\d+\b/i,
  operator: /[-+*\/=%^~]|&&?|\|\|?|!=?|<(?:=>?|<|>)?|>[>=]?|\b(?:AND|BETWEEN|DIV|ILIKE|IN|IS|LIKE|NOT|OR|REGEXP|RLIKE|SOUNDS LIKE|XOR)\b/i,
  punctuation: /[;[\]()`,.]/
};

// node_modules/prismjs/components/prism-php.js
(function(Prism2) {
  var comment = /\/\*[\s\S]*?\*\/|\/\/.*|#(?!\[).*/;
  var constant = [
    {
      pattern: /\b(?:false|true)\b/i,
      alias: "boolean"
    },
    {
      pattern: /(::\s*)\b[a-z_]\w*\b(?!\s*\()/i,
      greedy: true,
      lookbehind: true
    },
    {
      pattern: /(\b(?:case|const)\s+)\b[a-z_]\w*(?=\s*[;=])/i,
      greedy: true,
      lookbehind: true
    },
    /\b(?:null)\b/i,
    /\b[A-Z_][A-Z0-9_]*\b(?!\s*\()/
  ];
  var number = /\b0b[01]+(?:_[01]+)*\b|\b0o[0-7]+(?:_[0-7]+)*\b|\b0x[\da-f]+(?:_[\da-f]+)*\b|(?:\b\d+(?:_\d+)*\.?(?:\d+(?:_\d+)*)?|\B\.\d+)(?:e[+-]?\d+)?/i;
  var operator = /<?=>|\?\?=?|\.{3}|\??->|[!=]=?=?|::|\*\*=?|--|\+\+|&&|\|\||<<|>>|[?~]|[/^|%*&<>.+-]=?/;
  var punctuation = /[{}\[\](),:;]/;
  Prism2.languages.php = {
    delimiter: {
      pattern: /\?>$|^<\?(?:php(?=\s)|=)?/i,
      alias: "important"
    },
    comment,
    variable: /\$+(?:\w+\b|(?=\{))/,
    package: {
      pattern: /(namespace\s+|use\s+(?:function\s+)?)(?:\\?\b[a-z_]\w*)+\b(?!\\)/i,
      lookbehind: true,
      inside: {
        punctuation: /\\/
      }
    },
    "class-name-definition": {
      pattern: /(\b(?:class|enum|interface|trait)\s+)\b[a-z_]\w*(?!\\)\b/i,
      lookbehind: true,
      alias: "class-name"
    },
    "function-definition": {
      pattern: /(\bfunction\s+)[a-z_]\w*(?=\s*\()/i,
      lookbehind: true,
      alias: "function"
    },
    keyword: [
      {
        pattern: /(\(\s*)\b(?:array|bool|boolean|float|int|integer|object|string)\b(?=\s*\))/i,
        alias: "type-casting",
        greedy: true,
        lookbehind: true
      },
      {
        pattern: /([(,?]\s*)\b(?:array(?!\s*\()|bool|callable|(?:false|null)(?=\s*\|)|float|int|iterable|mixed|object|self|static|string)\b(?=\s*\$)/i,
        alias: "type-hint",
        greedy: true,
        lookbehind: true
      },
      {
        pattern: /(\)\s*:\s*(?:\?\s*)?)\b(?:array(?!\s*\()|bool|callable|(?:false|null)(?=\s*\|)|float|int|iterable|mixed|never|object|self|static|string|void)\b/i,
        alias: "return-type",
        greedy: true,
        lookbehind: true
      },
      {
        pattern: /\b(?:array(?!\s*\()|bool|float|int|iterable|mixed|object|string|void)\b/i,
        alias: "type-declaration",
        greedy: true
      },
      {
        pattern: /(\|\s*)(?:false|null)\b|\b(?:false|null)(?=\s*\|)/i,
        alias: "type-declaration",
        greedy: true,
        lookbehind: true
      },
      {
        pattern: /\b(?:parent|self|static)(?=\s*::)/i,
        alias: "static-context",
        greedy: true
      },
      {
        pattern: /(\byield\s+)from\b/i,
        lookbehind: true
      },
      /\bclass\b/i,
      {
        pattern: /((?:^|[^\s>:]|(?:^|[^-])>|(?:^|[^:]):)\s*)\b(?:abstract|and|array|as|break|callable|case|catch|clone|const|continue|declare|default|die|do|echo|else|elseif|empty|enddeclare|endfor|endforeach|endif|endswitch|endwhile|enum|eval|exit|extends|final|finally|fn|for|foreach|function|global|goto|if|implements|include|include_once|instanceof|insteadof|interface|isset|list|match|namespace|never|new|or|parent|print|private|protected|public|readonly|require|require_once|return|self|static|switch|throw|trait|try|unset|use|var|while|xor|yield|__halt_compiler)\b/i,
        lookbehind: true
      }
    ],
    "argument-name": {
      pattern: /([(,]\s*)\b[a-z_]\w*(?=\s*:(?!:))/i,
      lookbehind: true
    },
    "class-name": [
      {
        pattern: /(\b(?:extends|implements|instanceof|new(?!\s+self|\s+static))\s+|\bcatch\s*\()\b[a-z_]\w*(?!\\)\b/i,
        greedy: true,
        lookbehind: true
      },
      {
        pattern: /(\|\s*)\b[a-z_]\w*(?!\\)\b/i,
        greedy: true,
        lookbehind: true
      },
      {
        pattern: /\b[a-z_]\w*(?!\\)\b(?=\s*\|)/i,
        greedy: true
      },
      {
        pattern: /(\|\s*)(?:\\?\b[a-z_]\w*)+\b/i,
        alias: "class-name-fully-qualified",
        greedy: true,
        lookbehind: true,
        inside: {
          punctuation: /\\/
        }
      },
      {
        pattern: /(?:\\?\b[a-z_]\w*)+\b(?=\s*\|)/i,
        alias: "class-name-fully-qualified",
        greedy: true,
        inside: {
          punctuation: /\\/
        }
      },
      {
        pattern: /(\b(?:extends|implements|instanceof|new(?!\s+self\b|\s+static\b))\s+|\bcatch\s*\()(?:\\?\b[a-z_]\w*)+\b(?!\\)/i,
        alias: "class-name-fully-qualified",
        greedy: true,
        lookbehind: true,
        inside: {
          punctuation: /\\/
        }
      },
      {
        pattern: /\b[a-z_]\w*(?=\s*\$)/i,
        alias: "type-declaration",
        greedy: true
      },
      {
        pattern: /(?:\\?\b[a-z_]\w*)+(?=\s*\$)/i,
        alias: ["class-name-fully-qualified", "type-declaration"],
        greedy: true,
        inside: {
          punctuation: /\\/
        }
      },
      {
        pattern: /\b[a-z_]\w*(?=\s*::)/i,
        alias: "static-context",
        greedy: true
      },
      {
        pattern: /(?:\\?\b[a-z_]\w*)+(?=\s*::)/i,
        alias: ["class-name-fully-qualified", "static-context"],
        greedy: true,
        inside: {
          punctuation: /\\/
        }
      },
      {
        pattern: /([(,?]\s*)[a-z_]\w*(?=\s*\$)/i,
        alias: "type-hint",
        greedy: true,
        lookbehind: true
      },
      {
        pattern: /([(,?]\s*)(?:\\?\b[a-z_]\w*)+(?=\s*\$)/i,
        alias: ["class-name-fully-qualified", "type-hint"],
        greedy: true,
        lookbehind: true,
        inside: {
          punctuation: /\\/
        }
      },
      {
        pattern: /(\)\s*:\s*(?:\?\s*)?)\b[a-z_]\w*(?!\\)\b/i,
        alias: "return-type",
        greedy: true,
        lookbehind: true
      },
      {
        pattern: /(\)\s*:\s*(?:\?\s*)?)(?:\\?\b[a-z_]\w*)+\b(?!\\)/i,
        alias: ["class-name-fully-qualified", "return-type"],
        greedy: true,
        lookbehind: true,
        inside: {
          punctuation: /\\/
        }
      }
    ],
    constant,
    function: {
      pattern: /(^|[^\\\w])\\?[a-z_](?:[\w\\]*\w)?(?=\s*\()/i,
      lookbehind: true,
      inside: {
        punctuation: /\\/
      }
    },
    property: {
      pattern: /(->\s*)\w+/,
      lookbehind: true
    },
    number,
    operator,
    punctuation
  };
  var string_interpolation = {
    pattern: /\{\$(?:\{(?:\{[^{}]+\}|[^{}]+)\}|[^{}])+\}|(^|[^\\{])\$+(?:\w+(?:\[[^\r\n\[\]]+\]|->\w+)?)/,
    lookbehind: true,
    inside: Prism2.languages.php
  };
  var string = [
    {
      pattern: /<<<'([^']+)'[\r\n](?:.*[\r\n])*?\1;/,
      alias: "nowdoc-string",
      greedy: true,
      inside: {
        delimiter: {
          pattern: /^<<<'[^']+'|[a-z_]\w*;$/i,
          alias: "symbol",
          inside: {
            punctuation: /^<<<'?|[';]$/
          }
        }
      }
    },
    {
      pattern: /<<<(?:"([^"]+)"[\r\n](?:.*[\r\n])*?\1;|([a-z_]\w*)[\r\n](?:.*[\r\n])*?\2;)/i,
      alias: "heredoc-string",
      greedy: true,
      inside: {
        delimiter: {
          pattern: /^<<<(?:"[^"]+"|[a-z_]\w*)|[a-z_]\w*;$/i,
          alias: "symbol",
          inside: {
            punctuation: /^<<<"?|[";]$/
          }
        },
        interpolation: string_interpolation
      }
    },
    {
      pattern: /`(?:\\[\s\S]|[^\\`])*`/,
      alias: "backtick-quoted-string",
      greedy: true
    },
    {
      pattern: /'(?:\\[\s\S]|[^\\'])*'/,
      alias: "single-quoted-string",
      greedy: true
    },
    {
      pattern: /"(?:\\[\s\S]|[^\\"])*"/,
      alias: "double-quoted-string",
      greedy: true,
      inside: {
        interpolation: string_interpolation
      }
    }
  ];
  Prism2.languages.insertBefore("php", "variable", {
    string,
    attribute: {
      pattern: /#\[(?:[^"'\/#]|\/(?![*/])|\/\/.*$|#(?!\[).*$|\/\*(?:[^*]|\*(?!\/))*\*\/|"(?:\\[\s\S]|[^\\"])*"|'(?:\\[\s\S]|[^\\'])*')+\](?=\s*[a-z$#])/im,
      greedy: true,
      inside: {
        "attribute-content": {
          pattern: /^(#\[)[\s\S]+(?=\]$)/,
          lookbehind: true,
          inside: {
            comment,
            string,
            "attribute-class-name": [
              {
                pattern: /([^:]|^)\b[a-z_]\w*(?!\\)\b/i,
                alias: "class-name",
                greedy: true,
                lookbehind: true
              },
              {
                pattern: /([^:]|^)(?:\\?\b[a-z_]\w*)+/i,
                alias: [
                  "class-name",
                  "class-name-fully-qualified"
                ],
                greedy: true,
                lookbehind: true,
                inside: {
                  punctuation: /\\/
                }
              }
            ],
            constant,
            number,
            operator,
            punctuation
          }
        },
        delimiter: {
          pattern: /^#\[|\]$/,
          alias: "punctuation"
        }
      }
    }
  });
  Prism2.hooks.add("before-tokenize", function(env) {
    if (!/<\?/.test(env.code)) {
      return;
    }
    var phpPattern = /<\?(?:[^"'/#]|\/(?![*/])|("|')(?:\\[\s\S]|(?!\1)[^\\])*\1|(?:\/\/|#(?!\[))(?:[^?\n\r]|\?(?!>))*(?=$|\?>|[\r\n])|#\[|\/\*(?:[^*]|\*(?!\/))*(?:\*\/|$))*?(?:\?>|$)/g;
    Prism2.languages["markup-templating"].buildPlaceholders(env, "php", phpPattern);
  });
  Prism2.hooks.add("after-tokenize", function(env) {
    Prism2.languages["markup-templating"].tokenizePlaceholders(env, "php");
  });
})(Prism);

// src/mainview/components/diff-view.ts
class DiffView {
  #el;
  #toolbarEl;
  #bodyEl;
  #contentEl;
  #filesHostEl;
  #filesToggleBtn;
  #files = [];
  #activeFile = null;
  #fileExpanded = new Map;
  #viewMode = "unified";
  #filesPanelVisible = false;
  constructor(container) {
    this.#filesToggleBtn = h("button", {
      class: "dv-icon-btn",
      title: "Toggle files changed",
      onclick: () => this.toggleFilesPanel(),
      innerHTML: `<svg class="dv-icon-folder" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <path d="M1.5 4.25C1.5 3.55964 2.05964 3 2.75 3h3.02c.31 0 .61.115.84.322l.89.807c.23.208.53.321.84.321h4.91c.69 0 1.25.56 1.25 1.25V11.5c0 .69-.56 1.25-1.25 1.25H2.75c-.69 0-1.25-.56-1.25-1.25V4.25Z" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/>
      </svg>`
    });
    this.#toolbarEl = h("div", { class: "dv-toolbar" }, [
      h("span", { class: "dv-file-label" }, [""]),
      h("span", { class: "dv-toolbar-spacer" }),
      h("button", {
        class: "dv-toggle active",
        dataset: { view: "unified" },
        onclick: () => this.#setViewMode("unified")
      }, ["Unified"]),
      h("button", {
        class: "dv-toggle",
        dataset: { view: "split" },
        onclick: () => this.#setViewMode("split")
      }, ["Split"]),
      this.#filesToggleBtn
    ]);
    this.#contentEl = h("div", { class: "dv-content" });
    this.#filesHostEl = h("aside", { class: "dv-files-host", hidden: true });
    this.#bodyEl = h("div", { class: "dv-body" }, [
      this.#contentEl,
      this.#filesHostEl
    ]);
    this.#el = h("div", { class: "diff-view" }, [
      this.#toolbarEl,
      this.#bodyEl
    ]);
    this.setFilesPanelVisible(false);
    container.appendChild(this.#el);
  }
  setFiles(files) {
    this.#files = files;
    const nextExpanded = new Map;
    for (const file of files) {
      nextExpanded.set(file.path, this.#fileExpanded.get(file.path) ?? true);
    }
    this.#fileExpanded = nextExpanded;
    if (this.#activeFile && !files.some((f) => f.path === this.#activeFile)) {
      this.#activeFile = null;
    }
    this.#renderDiff();
  }
  showFile(path) {
    this.#activeFile = path;
    this.#fileExpanded.set(path, true);
    this.#renderDiff();
    this.#scrollToFile(path);
  }
  clear() {
    this.#files = [];
    this.#activeFile = null;
    this.#fileExpanded.clear();
    const label = this.#toolbarEl.querySelector(".dv-file-label");
    if (label)
      label.textContent = "";
    clearChildren(this.#contentEl);
    this.#contentEl.appendChild(h("div", { class: "dv-empty" }, ["No changes"]));
  }
  #renderDiff() {
    clearChildren(this.#contentEl);
    const label = this.#toolbarEl.querySelector(".dv-file-label");
    if (this.#files.length === 0) {
      if (label)
        label.textContent = "";
      this.#contentEl.appendChild(h("div", { class: "dv-empty" }, ["No changes"]));
      return;
    }
    if (label) {
      label.textContent = `${this.#files.length} file${this.#files.length !== 1 ? "s" : ""} changed`;
    }
    for (const file of this.#files) {
      this.#contentEl.appendChild(this.#renderFileSection(file));
    }
    if (this.#activeFile) {
      this.#scrollToFile(this.#activeFile);
    }
  }
  #renderFileSection(file) {
    const statusSymbol = {
      added: "+",
      deleted: "−",
      modified: "∙",
      renamed: "R"
    }[file.status];
    const { adds, dels } = countFileChanges(file);
    const delta = [
      adds > 0 ? h("span", { class: "dv-delta-add" }, [`+${adds}`]) : null,
      dels > 0 ? h("span", { class: "dv-delta-del" }, [`-${dels}`]) : null
    ].filter(Boolean);
    const details = h("details", {
      class: `dv-file-section${file.path === this.#activeFile ? " active" : ""}`,
      dataset: { filePath: file.path }
    });
    details.open = this.#fileExpanded.get(file.path) ?? true;
    details.addEventListener("toggle", () => {
      this.#fileExpanded.set(file.path, details.open);
    });
    details.appendChild(h("summary", { class: "dv-file-summary" }, [
      h("span", { class: `dv-file-status dv-file-status-${file.status}` }, [statusSymbol]),
      h("span", { class: "dv-file-main" }, [
        h("span", { class: "dv-file-path" }, [file.path]),
        delta.length > 0 ? h("span", { class: "dv-file-delta" }, delta) : null
      ].filter(Boolean)),
      file.isBinary ? h("span", { class: "dv-file-binary" }, ["bin"]) : null
    ].filter(Boolean)));
    const body = h("div", { class: "dv-file-body" });
    if (file.isBinary) {
      body.appendChild(h("div", { class: "dv-file-empty" }, ["Binary file changed"]));
    } else if (file.hunks.length === 0) {
      body.appendChild(h("div", { class: "dv-file-empty" }, ["Empty diff"]));
    } else if (this.#viewMode === "unified") {
      body.appendChild(this.#buildUnifiedTable(file));
    } else {
      body.appendChild(this.#buildSplitTable(file));
    }
    details.appendChild(body);
    return details;
  }
  #buildUnifiedTable(file) {
    const table = h("table", { class: "diff-table unified" });
    for (const hunk of file.hunks) {
      table.appendChild(h("tr", { class: "diff-hunk-header" }, [
        h("td", { class: "line-no" }),
        h("td", { class: "line-content hunk-label" }, [hunk.header])
      ]));
      for (const line of hunk.lines) {
        const lineClass = `diff-line diff-${line.type}`;
        const prefix = { add: "+", delete: "-", context: " " }[line.type];
        const lineNo = line.type === "add" ? line.newLineNo : line.type === "delete" ? line.oldLineNo : line.newLineNo ?? line.oldLineNo;
        table.appendChild(h("tr", { class: lineClass }, [
          h("td", { class: "line-no" }, [
            lineNo != null ? String(lineNo) : ""
          ]),
          h("td", {
            class: "line-content",
            innerHTML: renderUnifiedLineContent(prefix, line.content, line.type, file.path)
          })
        ]));
      }
    }
    return table;
  }
  #buildSplitTable(file) {
    const table = h("table", { class: "diff-table split" });
    for (const hunk of file.hunks) {
      table.appendChild(h("tr", { class: "diff-hunk-header" }, [
        h("td", { class: "line-no" }),
        h("td", { class: "line-content hunk-label" }),
        h("td", { class: "line-no" }),
        h("td", { class: "line-content hunk-label" }, [hunk.header])
      ]));
      const pairs = pairLines(hunk.lines);
      for (const [left, right] of pairs) {
        const leftLineClass = left ? ` diff-${left.type}` : "";
        const rightLineClass = right ? ` diff-${right.type}` : "";
        table.appendChild(h("tr", { class: "diff-line" }, [
          h("td", { class: `line-no${leftLineClass}` }, [
            left?.oldLineNo != null ? String(left.oldLineNo) : ""
          ]),
          h("td", {
            class: `line-content${leftLineClass}`,
            innerHTML: left ? highlightCodeLine(left.content, file.path) : ""
          }),
          h("td", { class: `line-no${rightLineClass}` }, [
            right?.newLineNo != null ? String(right.newLineNo) : ""
          ]),
          h("td", {
            class: `line-content${rightLineClass}`,
            innerHTML: right ? highlightCodeLine(right.content, file.path) : ""
          })
        ]));
      }
    }
    return table;
  }
  #setViewMode(mode) {
    this.#viewMode = mode;
    for (const btn of this.#toolbarEl.querySelectorAll("[data-view]")) {
      btn.classList.toggle("active", btn.dataset.view === mode);
    }
    this.#renderDiff();
  }
  #scrollToFile(path) {
    requestAnimationFrame(() => {
      const target = Array.from(this.#contentEl.querySelectorAll(".dv-file-section")).find((el) => el.dataset.filePath === path);
      if (!target)
        return;
      target.scrollIntoView({ block: "nearest" });
    });
  }
  setFilesPanelVisible(visible) {
    this.#filesPanelVisible = visible;
    this.#el.classList.toggle("files-visible", visible);
    this.#filesHostEl.hidden = !visible;
    this.#filesToggleBtn.classList.toggle("active", visible);
  }
  toggleFilesPanel() {
    this.setFilesPanelVisible(!this.#filesPanelVisible);
  }
  get filesPanelHost() {
    return this.#filesHostEl;
  }
  get element() {
    return this.#el;
  }
}
function countFileChanges(file) {
  let adds = 0;
  let dels = 0;
  for (const hunk of file.hunks) {
    for (const line of hunk.lines) {
      if (line.type === "add")
        adds++;
      if (line.type === "delete")
        dels++;
    }
  }
  return { adds, dels };
}
function pairLines(lines) {
  const result = [];
  const deletes = [];
  const adds = [];
  const flush = () => {
    const max = Math.max(deletes.length, adds.length);
    for (let i = 0;i < max; i++) {
      result.push([deletes[i] ?? null, adds[i] ?? null]);
    }
    deletes.length = 0;
    adds.length = 0;
  };
  for (const line of lines) {
    if (line.type === "context") {
      flush();
      result.push([line, line]);
    } else if (line.type === "delete") {
      deletes.push(line);
    } else if (line.type === "add") {
      adds.push(line);
    }
  }
  flush();
  return result;
}
function renderUnifiedLineContent(prefix, content, type, filePath) {
  const prefixClass = type === "add" ? "dv-diff-prefix-add" : type === "delete" ? "dv-diff-prefix-del" : "dv-diff-prefix-context";
  const safePrefix = escapeHtml2(prefix);
  const highlighted = highlightCodeLine(content, filePath);
  return `<span class="dv-diff-prefix ${prefixClass}">${safePrefix}</span>${highlighted}`;
}
function highlightCodeLine(content, filePath) {
  if (content.length > 8000) {
    return escapeHtml2(content);
  }
  const prism = resolvePrism();
  if (!prism) {
    return fallbackHighlight(content);
  }
  const language = languageFromFilePath(filePath);
  const grammar = language ? resolveGrammar(prism.languages, language) : null;
  if (!grammar || !language) {
    return fallbackHighlight(content);
  }
  try {
    const highlighted = prism.highlight(content, grammar, language);
    return highlighted.includes("token") ? highlighted : fallbackHighlight(content);
  } catch {
    return fallbackHighlight(content);
  }
}
function languageFromFilePath(filePath) {
  const fileName = filePath.split("/").pop() ?? filePath;
  const ext = fileName.includes(".") ? fileName.split(".").pop().toLowerCase() : "";
  const map = {
    js: "javascript",
    jsx: "jsx",
    ts: "typescript",
    tsx: "tsx",
    c: "c",
    h: "c",
    cc: "cpp",
    cxx: "cpp",
    cpp: "cpp",
    hpp: "cpp",
    cs: "csharp",
    java: "java",
    kt: "kotlin",
    go: "go",
    rs: "rust",
    py: "python",
    rb: "ruby",
    sh: "bash",
    bash: "bash",
    zsh: "bash",
    json: "json",
    yml: "yaml",
    yaml: "yaml",
    md: "markdown",
    css: "css",
    sql: "sql",
    php: "php"
  };
  return map[ext] ?? null;
}
function escapeHtml2(text) {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function resolvePrism() {
  const globalPrism = globalThis?.Prism;
  if (globalPrism?.highlight && globalPrism?.languages) {
    return globalPrism;
  }
  const imported = import_prismjs.default;
  if (imported?.highlight && imported?.languages) {
    return imported;
  }
  return null;
}
function resolveGrammar(languages, language) {
  if (languages[language])
    return languages[language];
  if (language === "csharp") {
    return languages.cs ?? languages.dotnet ?? null;
  }
  if (language === "typescript") {
    return languages.ts ?? null;
  }
  if (language === "javascript") {
    return languages.js ?? null;
  }
  if (language === "yaml") {
    return languages.yml ?? null;
  }
  return null;
}
var FALLBACK_KEYWORD_REGEX = /\b(import|from|export|default|class|interface|type|enum|public|private|protected|function|const|let|var|return|if|else|for|while|switch|case|break|continue|new|async|await|try|catch|finally|extends|implements|static|readonly|true|false|null|undefined|using|namespace|void|string|int|bool|this|base)\b/g;
var FALLBACK_NUMBER_REGEX = /\b\d+(?:\.\d+)?\b/g;
var FALLBACK_STRING_REGEX = /`(?:\\.|[^`\\])*`|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g;
var FALLBACK_COMMENT_REGEX = /\/\/.*$/g;
function fallbackHighlight(content) {
  let html = escapeHtml2(content);
  const tokens = [];
  const stash = (value, className) => {
    const idx = tokens.push(`<span class="token ${className}">${value}</span>`) - 1;
    return `@@DV_FALLBACK_${idx}@@`;
  };
  html = html.replace(FALLBACK_STRING_REGEX, (m) => stash(m, "string"));
  html = html.replace(FALLBACK_COMMENT_REGEX, (m) => stash(m, "comment"));
  html = html.replace(FALLBACK_KEYWORD_REGEX, '<span class="token keyword">$1</span>');
  html = html.replace(FALLBACK_NUMBER_REGEX, '<span class="token number">$&</span>');
  return html.replace(/@@DV_FALLBACK_(\d+)@@/g, (_match, idx) => {
    return tokens[Number(idx)] ?? "";
  });
}

// src/mainview/components/files-panel.ts
class FilesPanel {
  #el;
  #listEl;
  #countEl;
  #callbacks;
  #activeFile = null;
  #files = [];
  #scope = "last_turn";
  #scopeLastBtn;
  #scopeAllBtn;
  constructor(container, callbacks) {
    this.#callbacks = callbacks;
    this.#countEl = h("span", { class: "fp-count" }, ["0"]);
    this.#scopeLastBtn = h("button", {
      class: "fp-scope-btn active",
      onclick: () => this.setScope("last_turn", true)
    }, ["Last turn"]);
    this.#scopeAllBtn = h("button", {
      class: "fp-scope-btn",
      onclick: () => this.setScope("all", true)
    }, ["All"]);
    const header = h("div", { class: "fp-header" }, [
      h("div", { class: "fp-header-left" }, [
        h("span", { class: "fp-title" }, ["Files Changed"]),
        this.#countEl
      ]),
      h("div", { class: "fp-scope-toggle" }, [
        this.#scopeLastBtn,
        this.#scopeAllBtn
      ])
    ]);
    this.#listEl = h("div", { class: "fp-list" });
    this.#el = h("div", { class: "files-panel" }, [
      header,
      this.#listEl
    ]);
    container.appendChild(this.#el);
  }
  render(files) {
    this.#files = files;
    this.#countEl.textContent = String(files.length);
    clearChildren(this.#listEl);
    if (files.length === 0) {
      this.#listEl.appendChild(h("div", { class: "fp-empty" }, [
        this.#scope === "last_turn" ? "No changes in last turn" : "No changes"
      ]));
      return;
    }
    for (const file of files) {
      this.#listEl.appendChild(this.#renderFile(file));
    }
  }
  setActiveFile(path) {
    this.#activeFile = path;
    for (const item of this.#listEl.querySelectorAll(".fp-file-item")) {
      item.classList.toggle("active", item.dataset.filePath === path);
    }
  }
  clear() {
    this.#files = [];
    this.#activeFile = null;
    this.#countEl.textContent = "0";
    clearChildren(this.#listEl);
    this.#listEl.appendChild(h("div", { class: "fp-empty" }, [
      this.#scope === "last_turn" ? "No changes in last turn" : "No changes"
    ]));
  }
  setScope(scope, notify = false) {
    this.#scope = scope;
    this.#scopeLastBtn.classList.toggle("active", scope === "last_turn");
    this.#scopeAllBtn.classList.toggle("active", scope === "all");
    if (notify) {
      this.#callbacks.onScopeChange(scope);
    }
  }
  #renderFile(file) {
    const statusIcon = { added: "+", deleted: "−", modified: "∙", renamed: "R" }[file.status];
    const statusClass = `fp-status-${file.status}`;
    const fileName = file.path.split("/").pop() ?? file.path;
    const dirPath = file.path.includes("/") ? file.path.slice(0, file.path.lastIndexOf("/")) : "";
    const { adds, dels } = countFileChanges2(file);
    const delta = [
      adds > 0 ? h("span", { class: "fp-delta-add" }, [`+${adds}`]) : null,
      dels > 0 ? h("span", { class: "fp-delta-del" }, [`-${dels}`]) : null
    ].filter(Boolean);
    return h("div", {
      class: `fp-file-item${file.path === this.#activeFile ? " active" : ""}`,
      dataset: { filePath: file.path },
      onclick: () => {
        this.setActiveFile(file.path);
        this.#callbacks.onSelectFile(file.path);
      }
    }, [
      h("span", { class: `fp-status ${statusClass}` }, [statusIcon]),
      h("div", { class: "fp-file-info" }, [
        h("div", { class: "fp-file-name-row" }, [
          h("span", { class: "fp-file-name" }, [fileName]),
          delta.length > 0 ? h("span", { class: "fp-file-delta" }, delta) : null
        ].filter(Boolean)),
        dirPath ? h("span", { class: "fp-file-dir" }, [dirPath]) : null
      ].filter(Boolean)),
      file.isBinary ? h("span", { class: "fp-binary-tag" }, ["bin"]) : null
    ].filter(Boolean));
  }
  get element() {
    return this.#el;
  }
}
function countFileChanges2(file) {
  let adds = 0;
  let dels = 0;
  for (const hunk of file.hunks) {
    for (const line of hunk.lines) {
      if (line.type === "add")
        adds++;
      if (line.type === "delete")
        dels++;
    }
  }
  return { adds, dels };
}

// src/mainview/index.ts
var rpc = Electroview.defineRPC({
  maxRequestTime: 30000,
  handlers: {
    requests: {},
    messages: {
      snapshotUpdate: (snapshot) => {
        appState.update((s) => ({ ...s, snapshot }));
      },
      sessionStream: ({
        sessionId,
        event
      }) => {
        updateSessionUsageEstimate(sessionId, event);
        const state = appState.get();
        if (state.activeSessionId === sessionId && chatView) {
          chatView.appendStreamEvent(event);
        }
        if (state.activeSessionId === sessionId && state.activeWorkspace && (event.type === "result" || isDiffMutationEvent(event))) {
          workspaceFileCache.delete(state.activeWorkspace);
          scheduleDiffRefresh(state.activeWorkspace, state.diffScope, event.type === "result" ? 0 : 120);
        }
      },
      sessionIdResolved: ({
        tempId,
        realId
      }) => {
        const state = appState.get();
        const live = new Set(state.liveSessions);
        if (live.has(tempId)) {
          live.delete(tempId);
          live.add(realId);
        }
        const updates = { liveSessions: live };
        if (state.activeSessionId === tempId) {
          updates.activeSessionId = realId;
        }
        appState.update((s) => ({ ...s, ...updates }));
      },
      toolApproval: (req) => {
        console.log("[webview] Tool approval request:", req.toolName, req.toolUseId, req.sessionId);
        const state = appState.get();
        if (chatView && state.activeSessionId === req.sessionId) {
          chatView.showToolApproval(req, async (allow) => {
            try {
              await rpc.request.respondToolApproval({
                toolUseId: req.toolUseId,
                allow
              });
            } catch (err) {
              console.error("Failed to respond to tool approval:", err);
            }
          });
        }
      },
      sessionEnded: ({
        sessionId,
        exitCode
      }) => {
        console.log(`Session ${sessionId} ended with code ${exitCode}`);
        sessionUsageEstimates.delete(sessionId);
        const state = appState.get();
        const live = new Set(state.liveSessions);
        live.delete(sessionId);
        appState.update((s) => ({ ...s, liveSessions: live }));
        if (state.activeWorkspace) {
          loadDiff(state.activeWorkspace);
        }
      }
    }
  }
});
var _electrobun = new browser_default.Electroview({ rpc });
var appState = new Store({
  snapshot: null,
  workspaces: [],
  expandedWorkspaces: new Set,
  activeWorkspace: null,
  activeSessionId: null,
  diffScope: "last_turn",
  historySessions: {},
  liveSessions: new Set,
  customSessionNames: {}
});
var panelLayout;
var sidebar;
var chatView;
var diffView;
var filesPanel;
var diffRefreshTimer = null;
var WORKSPACE_FILE_CACHE_MS = 30000;
var workspaceFileCache = new Map;
var sessionUsageEstimates = new Map;
function init() {
  const panelsContainer = qs("#panels");
  panelLayout = new PanelLayout(panelsContainer, [
    { id: "workspaces", minWidth: 200, defaultWidth: 0, hidden: true },
    { id: "chat", minWidth: 280, defaultWidth: 35 },
    { id: "diff", minWidth: 320, defaultWidth: 65 }
  ]);
  const wsPanel = panelLayout.getPanel("workspaces");
  const chatPanel = panelLayout.getPanel("chat");
  const diffPanel = panelLayout.getPanel("diff");
  sidebar = new Sidebar(wsPanel, {
    onSelectSession: (sessionId, workspacePath) => {
      appState.update((s) => ({
        ...s,
        activeSessionId: sessionId,
        activeWorkspace: workspacePath
      }));
      loadSessionTranscript(sessionId);
      loadDiff(workspacePath);
    },
    onNewSession: (workspacePath) => {
      appState.update((s) => ({
        ...s,
        activeSessionId: null,
        activeWorkspace: workspacePath
      }));
      chatView.clear();
      chatView.focus();
      loadDiff(workspacePath);
    },
    onAddWorkspace: () => openWorkspace(),
    onRemoveWorkspace: (path) => removeWorkspace(path),
    onDeleteSession: async (sessionId, workspacePath) => {
      const state = appState.get();
      const isLiveSession = state.liveSessions.has(sessionId);
      const transcriptPath = (state.historySessions[workspacePath] ?? []).find((h2) => h2.sessionId === sessionId)?.transcriptPath;
      if (isLiveSession) {
        try {
          await rpc.request.killSession({ sessionId });
        } catch (err) {
          console.error("Failed to kill session:", err);
        }
      }
      try {
        await rpc.request.deleteSession({
          sessionId,
          cwd: workspacePath,
          transcriptPath
        });
      } catch (err) {
        console.error("Failed to delete session transcript:", err);
      }
      appState.update((s) => {
        const live = new Set(s.liveSessions);
        live.delete(sessionId);
        const names = { ...s.customSessionNames };
        delete names[sessionId];
        const wsHistory = s.historySessions[workspacePath] ?? [];
        const nextHistory = wsHistory.filter((h2) => h2.sessionId !== sessionId);
        return {
          ...s,
          liveSessions: live,
          historySessions: {
            ...s.historySessions,
            [workspacePath]: nextHistory
          },
          customSessionNames: names,
          activeSessionId: s.activeSessionId === sessionId ? null : s.activeSessionId
        };
      });
      const next = appState.get();
      if (!next.activeSessionId) {
        chatView.clear();
      }
      loadSessionHistory(workspacePath);
    },
    onToggleWorkspace: (path) => {
      const state = appState.get();
      const wasExpanded = state.expandedWorkspaces.has(path);
      appState.update((s) => {
        const expanded = new Set(s.expandedWorkspaces);
        if (expanded.has(path))
          expanded.delete(path);
        else
          expanded.add(path);
        return { ...s, expandedWorkspaces: expanded };
      });
      if (!wasExpanded && !state.historySessions[path]) {
        loadSessionHistory(path);
      }
    },
    onRenameSession: async (sessionId, newName) => {
      try {
        await rpc.request.renameSession({ sessionId, newName });
        appState.update((s) => ({
          ...s,
          customSessionNames: { ...s.customSessionNames, [sessionId]: newName }
        }));
      } catch (err) {
        console.error("Failed to rename session:", err);
      }
    }
  });
  chatView = new ChatView(chatPanel, {
    onStopSession: async () => {
      const state = appState.get();
      if (!state.activeSessionId)
        return;
      try {
        await rpc.request.killSession({
          sessionId: state.activeSessionId
        });
      } catch (err) {
        console.error("Failed to kill session:", err);
      }
    },
    onSendPrompt: async (prompt, fullAccess, selectedFiles) => {
      const state = appState.get();
      const cwd = state.activeWorkspace;
      if (!cwd) {
        openWorkspace();
        return;
      }
      try {
        const isLive = state.activeSessionId && state.liveSessions.has(state.activeSessionId);
        if (state.activeSessionId && isLive) {
          await rpc.request.sendFollowUp({
            sessionId: state.activeSessionId,
            text: prompt,
            fullAccess,
            selectedFiles
          });
        } else {
          const { sessionId } = await rpc.request.sendPrompt({
            prompt,
            cwd,
            fullAccess,
            sessionId: state.activeSessionId ?? undefined,
            selectedFiles
          });
          const live = new Set(state.liveSessions);
          live.add(sessionId);
          appState.update((s) => ({ ...s, activeSessionId: sessionId, liveSessions: live }));
        }
      } catch (err) {
        console.error("Failed to send prompt:", err);
      }
    },
    onOpenInFinder: async (path) => {
      try {
        await rpc.request.openInFinder({ path });
      } catch (err) {
        console.error("Failed to open Finder:", err);
      }
    },
    onSearchFiles: async (query) => {
      const cwd = appState.get().activeWorkspace;
      if (!cwd)
        return [];
      return searchWorkspaceFiles(cwd, query, 30);
    }
  });
  diffView = new DiffView(diffPanel);
  filesPanel = new FilesPanel(diffView.filesPanelHost, {
    onSelectFile: (path) => {
      diffView.showFile(path);
    },
    onScopeChange: (scope) => {
      appState.update((s) => ({ ...s, diffScope: scope }));
      const state = appState.get();
      if (state.activeWorkspace) {
        loadDiff(state.activeWorkspace, scope);
      }
    }
  });
  qs("#btn-toggle-workspaces")?.addEventListener("click", () => {
    panelLayout.togglePanel("workspaces");
    qs("#btn-toggle-workspaces")?.classList.toggle("active", panelLayout.isPanelVisible("workspaces"));
  });
  document.addEventListener("keydown", (e) => {
    const mod = e.metaKey || e.ctrlKey;
    if (mod && e.key === "b") {
      e.preventDefault();
      panelLayout.togglePanel("workspaces");
      qs("#btn-toggle-workspaces")?.classList.toggle("active", panelLayout.isPanelVisible("workspaces"));
    }
    if (mod && e.key === "n") {
      e.preventDefault();
      const state = appState.get();
      if (state.activeWorkspace) {
        appState.update((s) => ({ ...s, activeSessionId: null }));
        chatView.clear();
        chatView.focus();
      } else {
        openWorkspace();
      }
    }
    if (mod && e.key === "o") {
      e.preventDefault();
      openWorkspace();
    }
  });
  appState.subscribe((state) => {
    const wsData = buildWorkspaceData(state);
    sidebar.render(wsData);
    sidebar.setActiveSession(state.activeSessionId);
    chatView.setHeader(resolveActiveSessionTitle(state), state.activeWorkspace);
    const contextInfo = resolveActiveContextUsage(state);
    chatView.setContextUsage(contextInfo?.contextPercentage ?? null, contextInfo?.model ?? null, contextInfo?.activity ?? null, contextInfo?.promptTokens ?? null);
  });
  loadWorkspaces();
  loadSessionNames();
}
async function loadSessionTranscript(sessionId) {
  try {
    const state = appState.get();
    let transcriptPath;
    for (const sessions of Object.values(state.historySessions)) {
      const found = sessions.find((s) => s.sessionId === sessionId);
      if (found) {
        transcriptPath = found.transcriptPath;
        break;
      }
    }
    const messages = await rpc.request.getTranscript({
      sessionId,
      transcriptPath
    });
    chatView.renderTranscript(messages);
  } catch (err) {
    console.error("Failed to load transcript:", err);
    chatView.clear();
  }
}
async function loadSessionHistory(cwd) {
  try {
    const history = await rpc.request.getSessionHistory({ cwd });
    appState.update((s) => ({
      ...s,
      historySessions: { ...s.historySessions, [cwd]: history }
    }));
  } catch (err) {
    console.error("Failed to load session history:", err);
  }
}
async function loadDiff(cwd, scope) {
  try {
    const selectedScope = scope ?? appState.get().diffScope;
    filesPanel.setScope(selectedScope);
    const files = await rpc.request.getDiff({
      cwd,
      scope: selectedScope
    });
    filesPanel.render(files);
    diffView.setFiles(files);
    if (files.length > 0) {
      filesPanel.setActiveFile(files[0].path);
      diffView.showFile(files[0].path);
    } else {
      diffView.clear();
    }
  } catch (err) {
    console.error("Failed to load diff:", err);
    filesPanel.clear();
    diffView.clear();
  }
}
function scheduleDiffRefresh(cwd, scope, delayMs) {
  if (diffRefreshTimer) {
    clearTimeout(diffRefreshTimer);
  }
  diffRefreshTimer = setTimeout(() => {
    diffRefreshTimer = null;
    loadDiff(cwd, scope);
  }, delayMs);
}
function isDiffMutationEvent(event) {
  const ev = event;
  if (ev.type !== "user")
    return false;
  const toolResult = ev.tool_use_result;
  if (!toolResult || typeof toolResult !== "object")
    return false;
  const kind = String(toolResult.type ?? "").toLowerCase();
  if (kind === "create" || kind === "update" || kind === "delete" || kind === "rename") {
    return true;
  }
  const hasPatch = Array.isArray(toolResult.structuredPatch) && toolResult.structuredPatch.length > 0;
  return hasPatch;
}
async function loadWorkspaces() {
  try {
    const workspaces = await rpc.request.getWorkspaces({});
    const expanded = new Set;
    if (workspaces.length > 0) {
      expanded.add(workspaces[0]);
    }
    appState.update((s) => ({
      ...s,
      workspaces,
      expandedWorkspaces: expanded,
      activeWorkspace: workspaces[0] ?? null
    }));
    if (workspaces.length > 0) {
      panelLayout.showPanel("workspaces");
      qs("#btn-toggle-workspaces")?.classList.add("active");
      loadDiff(workspaces[0], appState.get().diffScope);
      loadSessionHistory(workspaces[0]);
    }
  } catch {}
}
async function loadSessionNames() {
  try {
    const names = await rpc.request.getSessionNames({});
    appState.update((s) => ({
      ...s,
      customSessionNames: names
    }));
  } catch (err) {
    console.error("Failed to load session names:", err);
  }
}
async function openWorkspace() {
  try {
    const dir = await rpc.request.pickDirectory({});
    if (!dir)
      return;
    await rpc.request.addWorkspace({ path: dir });
    const state = appState.get();
    const expanded = new Set(state.expandedWorkspaces);
    expanded.add(dir);
    appState.update((s) => ({
      ...s,
      workspaces: [dir, ...s.workspaces.filter((w) => w !== dir)],
      expandedWorkspaces: expanded,
      activeWorkspace: dir
    }));
    panelLayout.showPanel("workspaces");
    qs("#btn-toggle-workspaces")?.classList.add("active");
    loadDiff(dir, appState.get().diffScope);
    loadSessionHistory(dir);
  } catch (err) {
    console.error("Failed to pick directory:", err);
  }
}
async function removeWorkspace(path) {
  try {
    await rpc.request.removeWorkspace({ path });
    workspaceFileCache.delete(path);
    appState.update((s) => {
      const workspaces = s.workspaces.filter((w) => w !== path);
      const expanded = new Set(s.expandedWorkspaces);
      expanded.delete(path);
      return {
        ...s,
        workspaces,
        expandedWorkspaces: expanded,
        activeWorkspace: s.activeWorkspace === path ? workspaces[0] ?? null : s.activeWorkspace
      };
    });
  } catch (err) {
    console.error("Failed to remove workspace:", err);
  }
}
async function searchWorkspaceFiles(cwd, query, limit) {
  const cached = workspaceFileCache.get(cwd);
  let files = cached?.files;
  const cacheAgeMs = cached ? Date.now() - cached.loadedAt : Number.POSITIVE_INFINITY;
  if (!files || cacheAgeMs > WORKSPACE_FILE_CACHE_MS) {
    const loaded = await rpc.request.getWorkspaceFiles({ cwd });
    files = Array.isArray(loaded) ? loaded : [];
    workspaceFileCache.set(cwd, { files, loadedAt: Date.now() });
  }
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) {
    return files.slice(0, limit);
  }
  return files.map((path) => ({ path, score: scoreWorkspaceFile(path, normalizedQuery) })).filter((entry) => entry.score > 0).sort((a, b) => {
    if (a.score !== b.score)
      return b.score - a.score;
    return a.path.localeCompare(b.path);
  }).slice(0, limit).map((entry) => entry.path);
}
function scoreWorkspaceFile(path, query) {
  const normalizedPath = path.toLowerCase();
  const fileName = path.split("/").pop()?.toLowerCase() ?? normalizedPath;
  if (fileName === query)
    return 500;
  if (fileName.startsWith(query))
    return 400 - Math.min(fileName.length, 200);
  if (normalizedPath.startsWith(query))
    return 320 - Math.min(normalizedPath.length, 200);
  const nameIdx = fileName.indexOf(query);
  if (nameIdx >= 0)
    return 260 - Math.min(nameIdx, 120);
  const pathIdx = normalizedPath.indexOf(query);
  if (pathIdx >= 0)
    return 200 - Math.min(pathIdx, 120);
  return 0;
}
function buildWorkspaceData(state) {
  const liveSessions = state.snapshot ? buildSessionList(state.snapshot) : [];
  return state.workspaces.map((wsPath) => {
    const name = wsPath.split("/").pop() ?? wsPath;
    const wsLive = liveSessions.filter((s) => s.cwd === wsPath);
    const liveIds = new Set(wsLive.map((s) => s.sessionId));
    const history = (state.historySessions[wsPath] ?? []).filter((h2) => !liveIds.has(h2.sessionId)).map(historyToSessionInfo);
    const allSessions = [...wsLive, ...history].map((s) => ({
      ...s,
      topic: state.customSessionNames[s.sessionId] ?? s.topic
    }));
    return {
      path: wsPath,
      name,
      sessions: allSessions,
      expanded: state.expandedWorkspaces.has(wsPath)
    };
  });
}
function historyToSessionInfo(h2) {
  return {
    sessionId: h2.sessionId,
    topic: h2.topic,
    prompt: h2.prompt,
    cwd: h2.cwd,
    activity: "finished",
    model: h2.model,
    contextPercentage: null,
    currentToolLabel: null,
    startedAt: h2.startedAt ?? "",
    updatedAt: h2.lastActiveAt ?? h2.startedAt ?? "",
    isAppSpawned: false,
    transcriptPath: h2.transcriptPath
  };
}
function buildSessionList(snapshot) {
  const seen = new Set;
  const result = [];
  for (const task of snapshot.tasks) {
    if (seen.has(task.sessionId))
      continue;
    seen.add(task.sessionId);
    let activity = "idle";
    if (task.endedAt || ["completed", "error", "cancelled"].includes(task.status)) {
      activity = "finished";
    } else if (task.status === "running") {
      activity = "working";
    } else if (task.status === "waiting_for_input") {
      activity = "waiting_for_input";
    } else if (task.status === "waiting") {
      activity = "waiting";
    }
    result.push({
      sessionId: task.sessionId,
      topic: task.topic,
      prompt: task.prompt,
      cwd: task.cwd,
      activity,
      model: task.model,
      contextPercentage: task.contextPercentage,
      currentToolLabel: task.currentToolLabel,
      startedAt: task.startedAt,
      updatedAt: task.updatedAt,
      isAppSpawned: false,
      transcriptPath: task.transcriptPath
    });
  }
  return result;
}
function resolveActiveSessionTitle(state) {
  const activeSessionId = state.activeSessionId;
  if (!activeSessionId)
    return "New session";
  const custom = state.customSessionNames[activeSessionId]?.trim();
  if (custom)
    return custom;
  if (state.snapshot) {
    const live = buildSessionList(state.snapshot).find((s) => s.sessionId === activeSessionId);
    if (live?.topic?.trim())
      return live.topic.trim();
    if (live?.prompt?.trim())
      return live.prompt.trim();
  }
  for (const sessions of Object.values(state.historySessions)) {
    const found = sessions.find((s) => s.sessionId === activeSessionId);
    if (!found)
      continue;
    if (found.topic?.trim())
      return found.topic.trim();
    if (found.prompt?.trim())
      return found.prompt.trim();
    break;
  }
  return "Session";
}
function resolveActiveContextUsage(state) {
  const activeSessionId = state.activeSessionId;
  if (!activeSessionId || !state.snapshot)
    return null;
  const live = buildSessionList(state.snapshot).find((s) => s.sessionId === activeSessionId);
  if (!live)
    return null;
  const estimate = sessionUsageEstimates.get(activeSessionId);
  return {
    contextPercentage: live.contextPercentage,
    model: live.model ?? estimate?.model ?? null,
    activity: live.activity,
    promptTokens: estimate?.promptTokens ?? null
  };
}
function updateSessionUsageEstimate(sessionId, event) {
  const ev = event;
  if (ev?.type === "system" && ev?.subtype === "init") {
    const model2 = typeof ev.model === "string" ? ev.model : null;
    const current2 = sessionUsageEstimates.get(sessionId);
    sessionUsageEstimates.set(sessionId, {
      promptTokens: current2?.promptTokens ?? null,
      model: model2 ?? current2?.model ?? null
    });
    return;
  }
  if (ev?.type !== "assistant")
    return;
  const usage = ev?.message?.usage;
  const promptTokens = extractPromptTokenUsage(usage);
  const model = typeof ev?.message?.model === "string" ? ev.message.model : null;
  const current = sessionUsageEstimates.get(sessionId);
  sessionUsageEstimates.set(sessionId, {
    promptTokens: promptTokens ?? current?.promptTokens ?? null,
    model: model ?? current?.model ?? null
  });
}
function extractPromptTokenUsage(usage) {
  if (!usage || typeof usage !== "object")
    return null;
  const bag = usage;
  const input = asFiniteNumber(bag.input_tokens ?? bag.inputTokens) ?? 0;
  const cacheRead = asFiniteNumber(bag.cache_read_input_tokens ?? bag.cacheReadInputTokens) ?? 0;
  const cacheCreate = asFiniteNumber(bag.cache_creation_input_tokens ?? bag.cacheCreationInputTokens) ?? 0;
  const total = input + cacheRead + cacheCreate;
  return total > 0 ? total : null;
}
function asFiniteNumber(value) {
  if (value === null || value === undefined || value === "")
    return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
