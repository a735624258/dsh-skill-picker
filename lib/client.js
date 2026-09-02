window.__ModuleLoader__.load({ id: 'dsh-skill-picker', factory: (require) => { var module = { exports: {} }; var exports = module.exports;
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all2) => {
  for (var name in all2)
    __defProp(target, name, { get: all2[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/client/index.jsx
var index_exports = {};
__export(index_exports, {
  apply: () => apply,
  inject: () => inject
});
module.exports = __toCommonJS(index_exports);
var import_react = __toESM(require("react"), 1);

// node_modules/fuzzysort/fuzzysort.js
function single(search, target) {
  if (!search || !target) return null;
  let query = getQuery(search);
  if (!isPrepared(target)) target = getPrepared(target);
  if ((query.bitflags & target._bitflags) !== query.bitflags) return null;
  let result = !query.hasSpace && query.lowerCodes.length === 2 ? algorithm2(query, target) : algorithm(query, target);
  return result && materialize(result);
}
function go(search, targets, options) {
  if (targets instanceof SnapshotTargets) return goSnapshot(search, targets, options);
  let key = options?.key;
  let keys = !key && options?.keys;
  let firstTarget = targets[0];
  if (!key && !keys && typeof firstTarget === "object" && firstTarget !== null && !isPrepared(firstTarget)) {
    throw new Error("fuzzysort: key or keys is required when searching object targets");
  }
  if (!search) return all(targets, options);
  let query = getQuery(search);
  if (keys) return goKeys(query, targets, options);
  let searchBitflags = query.bitflags;
  let twoChar = !query.hasSpace && query.lowerCodes.length === 2;
  let threshold = denormalizeScore(options?.threshold ?? 0.5);
  let limit = getLimit(options);
  let scoreFn = options?.scoreFn;
  let resultCount = 0;
  let limited = 0;
  let getter = key && makeGetter(key);
  for (let i = 0; i < targets.length; i++) {
    let obj = targets[i];
    let target = key ? getter === null ? obj[key] : getter(obj) : obj;
    if (!target) continue;
    if (!isPrepared(target)) target = getPrepared(target);
    if ((searchBitflags & target._bitflags) !== searchBitflags) continue;
    let result = twoChar ? algorithm2(query, target) : algorithm(query, target);
    if (result === null) continue;
    let resultScore = result._score;
    if (scoreFn) {
      result = materialize(result, key ? obj : void 0);
      resultScore = scoreFn(result);
      if (!resultScore) continue;
      result._score = resultScore = denormalizeScore(resultScore);
    }
    if (resultScore < threshold) continue;
    let room = resultCount < limit;
    if (room) resultCount++;
    else {
      limited++;
      if (resultScore <= heap.peek()._score) continue;
    }
    if (!scoreFn) result = materialize(result, key ? obj : void 0);
    room ? heap.add(result) : heap.replaceTop(result);
  }
  return finishResults(resultCount, limited);
}
function highlight(result, open = "<b>", close = "</b>", threshold = 0.5) {
  let callback = typeof open === "function" ? open : null;
  let target = result.target;
  if (result._bestKeyScore !== void 0 && normalizeScore(result._score) < normalizeScore(result._bestKeyScore) * threshold) return callback ? [target] : target;
  let raw = result._indexes;
  let indexes = raw === void 0 ? result.indexes : raw.slice(0, raw.len ?? raw.length).sort((a, b) => a - b);
  if (!indexes.length) return callback ? [target] : target;
  let output = callback ? [] : "";
  let lastIndex = 0;
  let matchI = 0;
  for (let i = 0; i < indexes.length; ) {
    let start = indexes[i++];
    let end = start + 1;
    while (indexes[i] === end) {
      i++;
      end++;
    }
    let before = target.slice(lastIndex, start);
    let match = target.slice(start, end);
    if (callback) output.push(before, callback(match, matchI++));
    else output += before + open + match + close;
    lastIndex = end;
  }
  if (callback) output.push(target.slice(lastIndex));
  else output += target.slice(lastIndex);
  return output;
}
function score(result) {
  let value = result.score;
  return value === void 0 ? normalizeScore(result._score) : value;
}
function remap(mappings) {
  for (let char in mappings) {
    remappings[char] = mappings[char];
    if (char.charCodeAt(0) < 128) customAsciiRemappings = true;
  }
  cleanup();
}
function prepare(target) {
  return prepTarget(target);
}
function snapshot(targets, options) {
  return new SnapshotTargets(targets, options);
}
function cleanup() {
  targetCache.clear();
  searchCache.clear();
  heap.clear();
  simpleMatch = [];
  strictMatch = [];
  seen = [];
  seenAt = [];
  changes = [];
  partials = [];
  spaceScores = [];
  partIndexes = [];
  winnerIndexes = [];
  winnerScores = [];
  winnerKeys = [];
  keyTargets = [];
  keyResults = [];
  candidateBitOffsets = [];
  seenGeneration = 0;
}
function goSnapshotValues(search, snapshot2, options, singleChar) {
  let targets = snapshot2._targets;
  let objects = snapshot2._objects;
  let threshold = denormalizeScore(options?.threshold ?? 0.5);
  let limit = getLimit(options);
  let scoreFn = options?.scoreFn;
  let searchLen = search.lowerCodes.length;
  let shortSearch = !search.hasSpace && searchLen <= 3;
  let twoChar = !search.hasSpace && searchLen === 2;
  let rows = snapshot2._candidateRows;
  let rowsLength = snapshot2._candidateLength;
  let matchedRows = snapshot2._rows;
  let matchedCount = 0;
  let resultCount = 0;
  let limited = 0;
  for (let n = 0; n < rowsLength; n++) {
    let i = rows === null ? n : rows[n];
    let target = targets[i];
    if (target === noTarget || (search.bitflags & target._bitflags) !== search.bitflags) continue;
    let targetShort = shortSearch && target.target.length < 65535;
    let cutoff = !scoreFn && threshold === -INF && resultCount >= limit ? heap.peek()._score : -INF;
    let result;
    if (singleChar && targetShort) result = algorithm1(search, target, snapshot2._first, i);
    else if (twoChar && targetShort) {
      let start = snapshot2._offsets[i];
      let end = snapshot2._offsets[i + 1];
      result = algorithm2(search, target, snapshot2._beginnings, start, end, cutoff);
    } else if (twoChar) result = algorithm2(search, target, null, 0, 0, cutoff);
    else if (targetShort) {
      let start = snapshot2._offsets[i];
      let end = snapshot2._offsets[i + 1];
      result = algorithm(search, target, false, false, false, true, snapshot2._beginnings, start, end, cutoff);
    } else result = algorithm(search, target, false, false, false, true, null, 0, 0, cutoff);
    if (result === null) continue;
    matchedRows[matchedCount++] = i;
    if (result === prunedMatch) {
      limited++;
      continue;
    }
    let resultScore = result._score;
    if (scoreFn) {
      result = materialize(result, objects?.[i]);
      resultScore = scoreFn(result);
      if (!resultScore) continue;
      result._score = resultScore = denormalizeScore(resultScore);
    }
    if (resultScore < threshold) continue;
    let room = resultCount < limit;
    if (room) resultCount++;
    else {
      limited++;
      if (resultScore <= heap.peek()._score) continue;
    }
    if (objects && !scoreFn) result = materialize(result, objects[i]);
    room ? heap.add(result) : heap.replaceTop(result);
  }
  snapshot2._matchedRowsLen = matchedCount;
  return finishResults(resultCount, limited, !objects && !scoreFn && materialize);
}
function goSnapshot(search, snapshot2, options) {
  if (options?.key || options?.keys) throw new Error("fuzzysort: key/keys must be provided to snapshot(), not go()");
  snapshot2._finish();
  if (!search) return allSnapshot(snapshot2, options);
  let query = getQuery(search);
  let backtrack = snapshot2._backtrack(query, options);
  if (backtrack) return backtrack;
  snapshot2._beginSearch(query);
  try {
    let results;
    if (snapshot2._mode < 2) {
      let searchLen = query.lowerCodes.length;
      let code = query.lowerCodes[0];
      let singleChar = searchLen === 1 && code >= 97 && code <= 122;
      results = goSnapshotValues(query, snapshot2, options, singleChar);
    } else results = goKeys(query, snapshot2._objects, options, snapshot2);
    snapshot2._endSearch(query);
    snapshot2._remember(query, results, options);
    return results;
  } catch (error) {
    snapshot2._resetSearch();
    throw error;
  }
}
function goKeys(query, objects, options, snapshot2) {
  let indexed = snapshot2 !== void 0;
  let keys = indexed ? null : options.keys;
  let getters = indexed ? null : keys.map(makeGetter);
  let targets = indexed ? snapshot2._targets : null;
  let keysLength = indexed ? snapshot2._keysLength : keys.length;
  let searchBitflags = query.bitflags;
  let hasSpace = query.hasSpace;
  let spaceCount = query.parts.length;
  let threshold = denormalizeScore(options?.threshold ?? 0.5);
  let limit = getLimit(options);
  let searchLen = query.lowerCodes.length;
  let short = indexed && !hasSpace && searchLen <= 3;
  let twoChar = !hasSpace && searchLen === 2;
  let code = query.lowerCodes[0];
  let singleChar = short && searchLen === 1 && code >= 97 && code <= 122;
  let scoreFn = options?.scoreFn;
  let deferMaterialization = indexed && !scoreFn && (limit !== INF || threshold > -INF);
  let rows = indexed ? snapshot2._candidateRows : null;
  let rowsLength = indexed ? snapshot2._candidateLength : objects.length;
  let matchedRows = indexed ? snapshot2._rows : null;
  let matchedCount = 0;
  let resultCount = 0;
  let limited = 0;
  outer: for (let n = 0; n < rowsLength; n++) {
    let i = rows === null ? n : rows[n];
    let row = i * keysLength;
    if (indexed) {
      if ((searchBitflags & snapshot2._bitflags[i]) !== searchBitflags) continue;
    } else {
      let obj = objects[i];
      let keysBitflags = 0;
      for (let k = 0; k < keysLength; k++) {
        let target = getters[k] === null ? obj[keys[k]] : getters[k](obj);
        if (!target) target = noTarget;
        else if (!isPrepared(target)) target = getPrepared(target);
        keyTargets[k] = target;
        keysBitflags |= target._bitflags;
      }
      if ((searchBitflags & keysBitflags) !== searchBitflags) continue;
    }
    if (hasSpace) for (let s = 0; s < spaceCount; s++) {
      spaceScores[s] = winnerScores[s] = -INF;
      winnerKeys[s] = -1;
    }
    for (let k = 0; k < keysLength; k++) {
      let target = indexed ? targets[row + k] : keyTargets[k];
      if (target === noTarget) {
        keyResults[k] = noTarget;
        continue;
      }
      if (hasSpace && indexed) {
        let possible = false;
        for (let s = 0; s < spaceCount; s++) {
          let partBitflags = query.parts[s].bitflags;
          if ((partBitflags & target._bitflags) === partBitflags) {
            possible = true;
            break;
          }
        }
        if (!possible) {
          keyResults[k] = noTarget;
          continue;
        }
      } else if (!hasSpace && (searchBitflags & target._bitflags) !== searchBitflags) {
        keyResults[k] = noTarget;
        continue;
      }
      let match;
      if (indexed) {
        let valueRow = row + k;
        let targetShort = short && target.target.length < 65535;
        if (singleChar && targetShort) match = algorithm1(query, target, snapshot2._first, valueRow);
        else if (twoChar && targetShort) {
          let start = snapshot2._offsets[valueRow];
          let end = snapshot2._offsets[valueRow + 1];
          match = algorithm2(query, target, snapshot2._beginnings, start, end);
        } else if (twoChar) match = algorithm2(query, target);
        else if (targetShort) {
          let start = snapshot2._offsets[valueRow];
          let end = snapshot2._offsets[valueRow + 1];
          match = algorithm(query, target, false, false, false, true, snapshot2._beginnings, start, end);
        } else match = algorithm(query, target, false, hasSpace);
      } else match = twoChar ? algorithm2(query, target) : algorithm(query, target, false, hasSpace);
      if (match === null) {
        keyResults[k] = noTarget;
        continue;
      }
      keyResults[k] = deferMaterialization ? match : materialize(match);
      if (hasSpace) {
        mergePartScores(spaceCount);
        for (let s = 0; s < spaceCount; s++) {
          let partScore = partials[s];
          if (partScore <= winnerScores[s]) continue;
          winnerScores[s] = partScore;
          winnerKeys[s] = k;
          let source = partIndexes[s];
          let winner = winnerIndexes[s] ||= [];
          winner.length = source.length;
          for (let j = 0; j < source.length; j++) winner[j] = source[j];
        }
      }
    }
    if (hasSpace) {
      for (let s = 0; s < spaceCount; s++) if (winnerKeys[s] !== -1) {
        appendIndexes(keyResults[winnerKeys[s]]._indexes, winnerIndexes[s]);
      }
    }
    let resultScore;
    if (hasSpace) {
      resultScore = 0;
      for (let s = 0; s < spaceCount; s++) {
        let partScore = spaceScores[s];
        if (partScore === -INF) continue outer;
        resultScore += partScore;
      }
    } else {
      resultScore = mergeScores(keyResults, keysLength);
      if (resultScore === -INF) continue;
    }
    if (indexed) matchedRows[matchedCount++] = i;
    let result = deferMaterialization ? null : captureKeysResult(keyResults, keysLength, objects[i], resultScore, hasSpace);
    if (scoreFn) {
      resultScore = scoreFn(result);
      if (!resultScore) continue;
      result._score = resultScore = denormalizeScore(resultScore);
    }
    if (resultScore < threshold) continue;
    let room = resultCount < limit;
    if (room) resultCount++;
    else {
      limited++;
      if (resultScore <= heap.peek()._score) continue;
    }
    if (result === null) result = captureKeysResult(keyResults, keysLength, objects[i], resultScore, hasSpace);
    room ? heap.add(result) : heap.replaceTop(result);
  }
  if (indexed) snapshot2._matchedRowsLen = matchedCount;
  return finishResults(resultCount, limited, deferMaterialization && materializeKeys);
}
function allSnapshot(snapshot2, options) {
  let results = [];
  let targets = snapshot2._targets;
  let objects = snapshot2._objects;
  let keysLength = snapshot2._keysLength;
  let total = keysLength === void 0 ? targets.length : objects.length;
  results.total = total;
  let limit = getLimit(options);
  for (let i = 0, length = Math.min(total, limit); i < length; i++) {
    if (keysLength === void 0) {
      results.push(newResult(targets[i].target, -INF, objects?.[i]));
      continue;
    }
    let row = i * keysLength;
    for (let k = 0; k < keysLength; k++) {
      let target = targets[row + k];
      keyResults[k] = target === noTarget ? noTarget : newResult(target.target, -INF);
    }
    results.push(captureKeysResult(keyResults, keysLength, objects[i], -INF));
  }
  return results;
}
function all(targets, options) {
  let results = [];
  results.total = targets.length;
  let limit = getLimit(options);
  let key = options?.key;
  let keys = !key && options?.keys;
  if (keys) {
    let getters = keys.map(makeGetter);
    for (let obj of targets) {
      for (let k = keys.length - 1; k >= 0; k--) {
        let target = getters[k] === null ? obj[keys[k]] : getters[k](obj);
        if (!target) keyResults[k] = noTarget;
        else {
          if (!isPrepared(target)) target = getPrepared(target);
          target._score = -INF;
          target._indexes.len = 0;
          keyResults[k] = target;
        }
      }
      results.push(captureKeysResult(keyResults, keys.length, obj, -INF));
      if (results.length >= limit) break;
    }
    return results;
  }
  let getter = key && makeGetter(key);
  for (let obj of targets) {
    let target = key ? getter === null ? obj[key] : getter(obj) : obj;
    if (target == null) continue;
    if (!isPrepared(target)) target = getPrepared(target);
    if (key) target = newResult(target.target, -INF, obj);
    else {
      target._score = -INF;
      target._indexes.len = 0;
    }
    results.push(target);
    if (results.length >= limit) break;
  }
  return results;
}
function finishResults(length, limited, transform) {
  if (!length) return noResults;
  let results = new Array(length);
  for (let i = length - 1; i >= 0; i--) {
    let result = heap.poll();
    if (transform) result = transform(result);
    if (result instanceof KeysResult && !result._partWinners) markBestKeyScore(result);
    results[i] = result;
  }
  results.total = length + limited;
  return results;
}
function materializeKeys(result) {
  for (let k = 0; k < result.length; k++) if (result[k] !== noTarget) result[k] = materialize(result[k]);
  return result;
}
function algorithm1(search, target, firstTable, row) {
  let matchI = target._targetLower.indexOf(search._lower);
  if (matchI === -1) return null;
  let beginning = firstTable[row * 26 + search.lowerCodes[0] - 97];
  let strict = beginning !== 0;
  if (strict) matchI = beginning - 1;
  let score2 = matchI === 0 ? 0 : -matchI * matchI * 0.2;
  if (!strict) score2 *= 1e3;
  else if (target._beginningsLen > 24) score2 *= (target._beginningsLen - 24) * 10;
  target._score = score2 - target._targetLowerCodes.length + 1;
  target._indexes[0] = matchI;
  target._indexes.len = 1;
  return target;
}
function algorithm2(search, target, beginnings = null, start = 0, end = 0, cutoff = -INF) {
  let targetCodes = target._targetLowerCodes;
  let targetLen = targetCodes.length;
  let firstCode = search.lowerCodes[0];
  let secondCode = search.lowerCodes[1];
  let first = 0;
  while (targetCodes[first] !== firstCode) if (++first >= targetLen) return null;
  let second = first + 1;
  while (targetCodes[second] !== secondCode) if (++second >= targetLen) return null;
  if (cutoff !== -INF && scoreCeiling(2, targetLen) <= cutoff) return prunedMatch;
  if (beginnings === null) {
    beginnings = target._beginnings;
    if (beginnings === null) target._beginnings = beginnings = makeBeginnings(target);
    end = beginnings.length;
  }
  let substringI = target._targetLower.indexOf(search._lower, first);
  let substring = substringI !== -1;
  let low = lowerBound(beginnings, start, end, substringI);
  let substringStart = substring && low < end && beginnings[low] === substringI;
  let strict = substringStart && substringI === first;
  if (!strict) {
    let firstBeginning = start;
    while (firstBeginning < end && beginnings[firstBeginning] < first) firstBeginning++;
    for (let backtracks = 0; firstBeginning < end; ) {
      let strictFirst = beginnings[firstBeginning];
      if (targetCodes[strictFirst] !== firstCode) {
        firstBeginning++;
        continue;
      }
      let consecutive = strictFirst + 1;
      if (targetCodes[consecutive] === secondCode) {
        first = strictFirst;
        second = consecutive;
        strict = true;
        break;
      }
      let secondBeginning = firstBeginning + 1;
      while (secondBeginning < end && beginnings[secondBeginning] <= consecutive) secondBeginning++;
      while (secondBeginning < end && targetCodes[beginnings[secondBeginning]] !== secondCode) secondBeginning++;
      if (secondBeginning < end) {
        first = strictFirst;
        second = beginnings[secondBeginning];
        strict = true;
        break;
      }
      if (++backtracks > 200) break;
      firstBeginning++;
    }
  }
  if (substring && !substringStart) {
    while (low < end && beginnings[low] <= substringI) low++;
    for (; low < end; low++) {
      let index = beginnings[low];
      if (targetCodes[index] === firstCode && targetCodes[index + 1] === secondCode) {
        substringI = index;
        substringStart = true;
        break;
      }
    }
  }
  if (substring && (!strict || substringStart)) {
    first = substringI;
    second = substringI + 1;
  }
  let resultScore = second - first === 1 ? 0 : first - second * 2 - 11;
  if (first) resultScore -= first * first * 0.2;
  if (!strict) resultScore *= 1e3;
  else if (end - start > 24) resultScore *= (end - start - 24) * 10;
  let lengthPenalty = (targetLen - 2) / 2;
  resultScore -= lengthPenalty;
  if (substring) resultScore /= 5;
  if (substringStart) resultScore /= 5;
  resultScore -= lengthPenalty;
  let substringEnd = substring && second === first + 1 && (second + 1 === targetLen || isBeginning(beginnings, start, end, second + 1));
  target._score = substringEnd ? resultScore + Math.min(4, -resultScore / 2) : resultScore;
  target._indexes[0] = first;
  target._indexes[1] = second;
  target._indexes.len = 2;
  return target;
}
function algorithm(search, target, spaces = false, partial = false, changed = false, singleMatch = true, beginnings = null, start = 0, end = 0, cutoff = -INF) {
  if (!spaces && search.hasSpace) return algorithmSpaces(search, target, partial);
  let searchCodes = search.lowerCodes;
  let targetCodes = target._targetLowerCodes;
  let searchLen = searchCodes.length;
  let targetLen = targetCodes.length;
  let searchCode = searchCodes[0];
  let searchI = 0;
  let targetI = 0;
  for (; ; ) {
    if (searchCode === targetCodes[targetI]) {
      simpleMatch[searchI] = targetI;
      if (++searchI === searchLen) break;
      searchCode = searchCodes[searchI];
    }
    if (++targetI >= targetLen) return null;
  }
  if (cutoff !== -INF && searchLen > 1 && scoreCeiling(searchLen, targetLen) <= cutoff) return prunedMatch;
  if (searchLen === 1 && !changed && singleMatch) {
    let matchI;
    let strict2;
    if (target._singleMatchCode === searchCode) {
      matchI = target._singleMatchIndex;
      strict2 = target._singleMatchStrict;
    } else if (target._nextBeginningIndexes !== null) {
      let next2 = target._nextBeginningIndexes;
      targetI = simpleMatch[0] === 0 ? 0 : next2[simpleMatch[0] - 1];
      while (targetI < targetLen && searchCode !== targetCodes[targetI]) targetI = next2[targetI];
      strict2 = targetI < targetLen;
      matchI = strict2 ? targetI : simpleMatch[0];
    } else {
      prepareSingleMatch(target, searchCode, simpleMatch[0]);
      matchI = target._singleMatchIndex;
      strict2 = target._singleMatchStrict;
    }
    let resultScore = matchI === 0 ? 0 : -matchI * matchI * 0.2;
    if (!strict2) resultScore *= 1e3;
    else if (target._beginningsLen > 24) resultScore *= (target._beginningsLen - 24) * 10;
    target._score = resultScore - (targetLen - 1);
    target._indexes[0] = matchI;
    target._indexes.len = 1;
    return target;
  }
  searchI = 0;
  let strict = false;
  let strictLen = 0;
  let next = target._nextBeginningIndexes;
  if (beginnings === null && next === null) next = target._nextBeginningIndexes = makeNextBeginnings(target);
  let beginningLen = beginnings === null ? changed ? 0 : target._beginningsLen : end - start;
  if (!beginningLen) {
    beginningLen = 1;
    for (let i = next[0]; i < targetLen; i = next[i]) beginningLen++;
    if (!changed) target._beginningsLen = beginningLen;
  }
  let substringI = searchLen <= 1 ? -1 : target._targetLower.indexOf(search._lower, simpleMatch[0]);
  let isSubstring = substringI !== -1;
  let substringStart = isSubstring && (substringI === 0 || (beginnings ? isBeginning(beginnings, start, end, substringI) : next[substringI - 1] === substringI));
  if (substringStart && substringI === simpleMatch[0]) strict = true;
  else {
    targetI = simpleMatch[0] === 0 ? 0 : beginnings ? nextBeginning(beginnings, start, end, simpleMatch[0] - 1, targetLen) : next[simpleMatch[0] - 1];
    let backtracks = 0;
    if (targetI !== targetLen) for (; ; ) {
      if (targetI >= targetLen) {
        if (searchI <= 0 || ++backtracks > 200) break;
        searchI--;
        let previous = strictMatch[--strictLen];
        targetI = beginnings ? nextBeginning(beginnings, start, end, previous, targetLen) : next[previous];
      } else if (searchCodes[searchI] === targetCodes[targetI]) {
        strictMatch[strictLen++] = targetI;
        if (++searchI === searchLen) {
          strict = true;
          break;
        }
        targetI++;
      } else targetI = beginnings ? nextBeginning(beginnings, start, end, targetI, targetLen) : next[targetI];
    }
  }
  if (isSubstring && !substringStart) {
    if (beginnings) {
      for (let b = start; b < end; b++) {
        let i = beginnings[b];
        if (i <= substringI) continue;
        let s = 0;
        for (; s < searchLen && searchCodes[s] === targetCodes[i + s]; s++) ;
        if (s === searchLen) {
          substringI = i;
          substringStart = true;
          break;
        }
      }
    } else for (let i = 0; i < next.length; i = next[i]) {
      if (i <= substringI) continue;
      let s = 0;
      for (; s < searchLen && searchCodes[s] === targetCodes[i + s]; s++) ;
      if (s === searchLen) {
        substringI = i;
        substringStart = true;
        break;
      }
    }
  }
  let matches;
  if (!strict) {
    if (isSubstring) for (let i = 0; i < searchLen; i++) simpleMatch[i] = substringI + i;
    matches = simpleMatch;
  } else if (substringStart) {
    for (let i = 0; i < searchLen; i++) simpleMatch[i] = substringI + i;
    matches = simpleMatch;
  } else matches = strictMatch;
  let matchEnd = matches[searchLen - 1] + 1;
  let substringEnd = isSubstring && matchEnd - matches[0] === searchLen && (matchEnd === targetLen || (beginnings ? isBeginning(beginnings, start, end, matchEnd) : next[matchEnd - 1] === matchEnd));
  target._score = calculateScore(matches, searchLen, targetLen, strict, beginningLen, isSubstring, substringStart, substringEnd);
  for (let i = 0; i < searchLen; i++) target._indexes[i] = matches[i];
  target._indexes.len = searchLen;
  return target;
}
function mergePartScores(length) {
  for (let i = 0; i < length; i++) {
    let partial = partials[i];
    let best = spaceScores[i];
    if (partial > -1e3 && best > -INF) best = Math.max(best, (best + partial) / 4);
    spaceScores[i] = Math.max(best, partial);
  }
}
function appendIndexes(indexes, additions) {
  let length = indexes.len;
  outer: for (let i = 0; i < additions.length; i++) {
    let index = additions[i];
    for (let j = 0; j < length; j++) if (indexes[j] === index) continue outer;
    indexes[length++] = index;
  }
  indexes.len = length;
}
function mergeScores(results, length) {
  let total = -INF;
  for (let i = 0; i < length; i++) {
    let score2 = results[i]._score;
    if (score2 > -1e3 && total > -INF) total = Math.max(total, (total + score2) / 4);
    if (score2 > total) total = score2;
  }
  return total;
}
function calculateScore(matches, searchLen, targetLen, strict, beginningLen, substring, substringStart, substringEnd) {
  let score2 = 0;
  let groups = 0;
  for (let i = 1; i < searchLen; i++) if (matches[i] - matches[i - 1] !== 1) {
    score2 -= matches[i];
    groups++;
  }
  let unmatchedDistance = matches[searchLen - 1] - matches[0] - (searchLen - 1);
  score2 -= (12 + unmatchedDistance) * groups;
  if (matches[0] !== 0) score2 -= matches[0] * matches[0] * 0.2;
  if (!strict) score2 *= 1e3;
  else if (beginningLen > 24) score2 *= (beginningLen - 24) * 10;
  let lengthPenalty = (targetLen - searchLen) / 2;
  score2 -= lengthPenalty;
  let substringBonus = 1 + searchLen * searchLen;
  if (substring) score2 /= substringBonus;
  if (substringStart) score2 /= substringBonus;
  score2 -= lengthPenalty;
  return substringEnd ? score2 + Math.min(4, -score2 / 2) : score2;
}
function algorithmSpaces(search, target, partial) {
  let seenLen = 0;
  let generation = ++seenGeneration;
  let score2 = 0;
  let result = null;
  let previousFirst = 0;
  let searches = search.parts;
  let changesLen = 0;
  let matched = false;
  for (let i = 0; i < searches.length; i++) {
    partials[i] = -INF;
    if (partial) (partIndexes[i] ||= []).length = 0;
    result = algorithm(searches[i], target, false, false, changesLen !== 0, false);
    if (result === null) {
      if (partial) continue;
      resetBeginnings(target, changesLen);
      return null;
    }
    matched = true;
    if (i < searches.length - 1) {
      let indexes = result._indexes;
      let consecutive = true;
      for (let j = 0; j < indexes.len - 1; j++) if (indexes[j + 1] - indexes[j] !== 1) {
        consecutive = false;
        break;
      }
      if (consecutive) {
        let beginning = indexes[indexes.len - 1] + 1;
        let previous = target._nextBeginningIndexes[beginning - 1];
        for (let j = beginning - 1; j >= 0 && target._nextBeginningIndexes[j] === previous; j--) {
          target._nextBeginningIndexes[j] = beginning;
          changes[changesLen * 2] = j;
          changes[changesLen * 2 + 1] = previous;
          changesLen++;
        }
      }
    }
    if (partial) {
      let indexes = partIndexes[i];
      indexes.length = result._indexes.len;
      for (let j = 0; j < indexes.length; j++) indexes[j] = result._indexes[j];
    }
    let partScore = result._score / searches.length;
    score2 += partScore;
    partials[i] = partScore;
    if (result._indexes[0] < previousFirst) score2 -= (previousFirst - result._indexes[0]) * 2;
    previousFirst = result._indexes[0];
    if (!partial) for (let j = 0; j < result._indexes.len; j++) {
      let index = result._indexes[j];
      if (seenAt[index] === generation) continue;
      seenAt[index] = generation;
      seen[seenLen++] = index;
    }
  }
  if (partial && !matched) return null;
  resetBeginnings(target, changesLen);
  if (target._bitflags & SPACE_BIT) {
    let spacedResult = algorithm(search, target, true);
    if (spacedResult !== null && spacedResult._score > score2) {
      if (partial) {
        let searchFrom = 0;
        for (let i = 0; i < searches.length; i++) {
          partials[i] = spacedResult._score / searches.length;
          let part = searches[i]._lower;
          let searchI = search._lower.indexOf(part, searchFrom);
          let indexes = partIndexes[i];
          indexes.length = part.length;
          for (let j = 0; j < part.length; j++) indexes[j] = spacedResult._indexes[searchI + j];
          searchFrom = searchI + part.length;
        }
        if (spacedResult._score < GOOD_PART_SCORE) spacedResult._indexes.len = 0;
      }
      return spacedResult;
    }
  }
  if (partial) {
    result = target;
    let targetLower = target._targetLower;
    for (let i = 1; i < searches.length; i++) {
      let previous = partIndexes[i - 1];
      if (!previous.length || !partIndexes[i].length) continue;
      let previousEnd = previous[previous.length - 1] + 1;
      let at = previousEnd;
      let code;
      while ((code = targetLower.charCodeAt(at)) === 32 || code >= 9 && code <= 13) at++;
      let part = searches[i]._lower;
      if (!targetLower.startsWith(part, at)) continue;
      for (let j = previousEnd; j < at; j++) previous.push(j);
      let indexes = partIndexes[i];
      indexes.length = part.length;
      for (let j = 0; j < part.length; j++) indexes[j] = at + j;
    }
    result._indexes.len = 0;
    for (let i = 0; i < searches.length; i++) if (partials[i] * searches.length >= GOOD_PART_SCORE) {
      appendIndexes(result._indexes, partIndexes[i]);
    }
  } else {
    for (let i = 0; i < seenLen; i++) result._indexes[i] = seen[i];
    result._indexes.len = seenLen;
  }
  result._score = score2;
  return result;
}
function resetBeginnings(target, changesLen) {
  for (let i = changesLen - 1; i >= 0; i--) {
    target._nextBeginningIndexes[changes[i * 2]] = changes[i * 2 + 1];
  }
}
var SnapshotTargets = class {
  constructor(targets, options) {
    this._mode = options?.keys ? 2 : options?.key ? 1 : 0;
    this._keys = this._mode === 2 ? options.keys.slice() : [options?.key];
    this._input = targets.slice();
    this._index = 0;
    this._done = false;
    this._error = null;
    this._scheduled = null;
    if (targets.length === 0) this._finish();
    else this._schedule();
  }
  _schedule() {
    if (this._scheduled !== null) return;
    this._scheduled = scheduleTask((deadline) => {
      this._scheduled = null;
      this._run(deadline);
    });
  }
  _cancel() {
    if (this._scheduled !== null) this._scheduled();
    this._scheduled = null;
  }
  _initialize() {
    if (this._targets) return;
    let keysLength = this._mode === 2 ? this._keys.length : 1;
    let valueCount = this._input.length * keysLength;
    let rowCount = this._input.length;
    this._targets = new Array(valueCount);
    this._first = new Uint16Array(valueCount * 26);
    this._offsets = new Uint32Array(valueCount + 1);
    this._buildingBeginnings = [];
    this._rowCount = rowCount;
    this._rowWords = rowCount + 31 >> 5;
    this._rowBits = new Uint32Array(this._rowWords * 32);
    this._rows = new Uint32Array(rowCount);
    this._lastRowsLen = 0;
    this._matchedRowsLen = 0;
    this._lastQuery = null;
    this._candidateRows = null;
    this._candidateLength = rowCount;
    this._history = [];
    if (this._mode) {
      this._objects = this._input;
      this._getters = this._keys.map(makeGetter);
    }
    if (this._mode === 2) {
      this._keysLength = keysLength;
      this._bitflags = new Int32Array(rowCount);
    }
  }
  _run(deadline) {
    if (this._done || this._error) return;
    let end = Date.now() + 4;
    let hasTime = () => deadline && !deadline.didTimeout ? deadline.timeRemaining() > 1 : Date.now() < end;
    try {
      this._initialize();
      do
        this._prepareOne();
      while (this._index < this._input.length && hasTime());
      if (this._index === this._input.length) this._complete();
      else this._schedule();
    } catch (error) {
      this._error = error;
      this._done = true;
    }
  }
  _indexRow(row, bitflags) {
    let flags = bitflags >>> 0;
    let word = row >> 5;
    let mask = 1 << (row & 31);
    let words = this._rowWords;
    let bits = this._rowBits;
    while (flags) {
      let lowest = flags & -flags;
      let bit = 31 - Math.clz32(lowest);
      bits[bit * words + word] |= mask;
      flags = (flags & flags - 1) >>> 0;
    }
  }
  _prepareOne() {
    let i = this._index++;
    let mode = this._mode;
    let obj = this._input[i];
    let keysLength = mode === 2 ? this._keysLength : 1;
    let bitflags = 0;
    for (let k = 0; k < keysLength; k++) {
      let value = mode === 0 ? obj : this._getters[k] === null ? obj[this._keys[k]] : this._getters[k](obj);
      let row = mode === 2 ? i * keysLength + k : i;
      let prepared = this._targets[row] = value ? prepTarget(value) : noTarget;
      if (prepared !== noTarget) indexBeginnings(prepared, this._first, row, this._buildingBeginnings);
      this._offsets[row + 1] = this._buildingBeginnings.length;
      bitflags |= prepared._bitflags;
    }
    if (mode === 2) this._bitflags[i] = bitflags;
    this._indexRow(i, bitflags);
  }
  _complete() {
    this._beginnings = Uint16Array.from(this._buildingBeginnings);
    this._buildingBeginnings = this._input = this._getters = this._keys = null;
    this._done = true;
  }
  _bitOffsets(bitflags) {
    let offsetsLen = 0;
    let words = this._rowWords;
    for (let bit = 0; bit < 32; bit++) if (bitflags & 1 << bit) candidateBitOffsets[offsetsLen++] = bit * words;
    return offsetsLen;
  }
  _matchRows(bitflags, fill = false, stop = INF) {
    let offsetsLen = this._bitOffsets(bitflags);
    if (!offsetsLen) {
      if (fill) {
        this._candidateRows = null;
        this._candidateLength = this._rowCount;
      }
      return this._rowCount;
    }
    let bits = this._rowBits;
    let words = this._rowWords;
    let rowsLen = 0;
    for (let word = 0; word < words; word++) {
      let matches = bits[candidateBitOffsets[0] + word];
      for (let i = 1; i < offsetsLen && matches; i++) matches &= bits[candidateBitOffsets[i] + word];
      if (!fill) {
        rowsLen += bitCount(matches);
        if (rowsLen >= stop) return rowsLen;
        continue;
      }
      while (matches) {
        let lowest = matches & -matches;
        this._rows[rowsLen++] = (word << 5) + 31 - Math.clz32(lowest);
        matches = (matches & matches - 1) >>> 0;
      }
    }
    if (fill) {
      this._candidateRows = this._rows;
      this._candidateLength = rowsLen;
    }
    return rowsLen;
  }
  _beginSearch(query) {
    this._matchedRowsLen = 0;
    let previousQuery = this._lastQuery;
    let previousLength = this._lastRowsLen;
    this._lastQuery = null;
    let bitflags = query.bitflags >>> 0;
    if (previousQuery !== null && query._lower.startsWith(previousQuery)) {
      let staticCount = this._matchRows(bitflags, false, previousLength);
      if (previousLength <= staticCount) {
        this._candidateRows = this._rows;
        this._candidateLength = previousLength;
        return;
      }
    }
    this._matchRows(bitflags, true);
  }
  _endSearch(query) {
    this._lastRowsLen = this._matchedRowsLen;
    this._matchedRowsLen = 0;
    this._lastQuery = query._lower || null;
    this._candidateRows = null;
    this._candidateLength = 0;
  }
  _backtrack(query, options) {
    let history = this._history;
    if (history.length < 2 || options?.scoreFn || options?.threshold !== void 0) return null;
    let limit = getLimit(options);
    if (limit === INF) return null;
    let current = history[history.length - 1];
    let value = query._lower;
    if (current.query === value && current.limit === limit && current.results) return copyResults(current.results);
    if (value.length >= current.query.length || !current.query.startsWith(value)) return null;
    let i = history.length - 2;
    while (i >= 0 && history[i].query.length > value.length) i--;
    let entry = history[i];
    if (!entry || entry.query !== value || entry.limit !== limit) return null;
    history.length = i + 1;
    if (!entry.results) return null;
    this._resetSearch();
    return copyResults(entry.results);
  }
  _remember(query, results, options) {
    let history = this._history;
    let limit = getLimit(options);
    if (options?.scoreFn || options?.threshold !== void 0 || limit === INF || results.length > 256) {
      history.length = 0;
      return;
    }
    let value = query._lower;
    let last = history[history.length - 1];
    if (last && !value.startsWith(last.query)) history.length = 0;
    else if (last?.query === value && last.limit === limit) history.pop();
    history.push({ query: value, limit, results: value.length <= 32 ? copyResults(results) : null });
  }
  _resetSearch() {
    this._lastQuery = null;
    this._lastRowsLen = this._matchedRowsLen = this._candidateLength = 0;
    this._candidateRows = null;
  }
  _finish() {
    if (this._error) throw this._error;
    if (this._done) return;
    this._cancel();
    try {
      this._initialize();
      while (this._index < this._input.length) this._prepareOne();
      this._complete();
    } catch (error) {
      this._error = error;
      this._done = true;
      throw error;
    }
  }
};
function copyResult(result) {
  if (result === noTarget) return noTarget;
  if (result instanceof KeysResult) {
    let copy2 = result.map(copyResult);
    copy2.obj = result.obj;
    copy2._score = result._score;
    if (result._partWinners) copy2._partWinners = true;
    return copy2;
  }
  let copy = materialize(result, result.obj);
  if (result._bestKeyScore !== void 0) copy._bestKeyScore = result._bestKeyScore;
  let indexes = result._indexes;
  copy._indexes = indexes.slice(0, indexes.len ?? indexes.length);
  copy._indexes.len = copy._indexes.length;
  return copy;
}
function copyResults(results) {
  let copies = results.map(copyResult);
  copies.total = results.total;
  return copies;
}
function prepTarget(target) {
  if (isPrepared(target)) target = target.target;
  else if (typeof target === "number") target = "" + target;
  else if (typeof target !== "string") target = "";
  let info = lowerInfo(target);
  return newResult(target, -INF, null, info._lower, info.lowerCodes, info.bitflags);
}
function prepQuery(search) {
  if (typeof search === "number") search = "" + search;
  else if (typeof search !== "string") search = "";
  search = remapChars(search).trim();
  let info = lowerInfoRemapped(search);
  info.bitflags &= ~SPACE_BIT;
  info.parts = info.hasSpace ? [...new Set(info._lower.split(/\s+/))].map(prepQuery) : [];
  return info;
}
function getPrepared(target) {
  if (target.length > 999) return prepTarget(target);
  let prepared = targetCache.get(target);
  if (prepared === void 0) targetCache.set(target, prepared = prepTarget(target));
  return prepared;
}
function getQuery(search) {
  if (search.length > 999) return prepQuery(search);
  let prepared = searchCache.get(search);
  if (prepared === void 0) {
    if (searchCache.size >= 512) searchCache.clear();
    searchCache.set(search, prepared = prepQuery(search));
  }
  return prepared;
}
function scanBeginnings(prepared, visit) {
  let target = remapChars(prepared.target);
  let wasUpper = false;
  let wasAlnum = false;
  let count = 0;
  for (let i = 0; i < target.length; i++) {
    let code = target.charCodeAt(i);
    let upper = code >= 65 && code <= 90;
    let alnum = upper || code >= 97 && code <= 122 || code >= 48 && code <= 57;
    let beginning = upper && !wasUpper || !wasAlnum || !alnum;
    wasUpper = upper;
    wasAlnum = alnum;
    if (beginning) {
      count++;
      visit(i);
    }
  }
  prepared._beginningsLen = count;
}
function indexBeginnings(prepared, firstTable, row, packed) {
  if (prepared.target.length >= 65535) return;
  let target = remapChars(prepared.target);
  let lowerCodes = prepared._targetLowerCodes;
  let offset = row * 26;
  let wasUpper = false;
  let wasAlnum = false;
  let count = 0;
  for (let i = 0; i < target.length; i++) {
    let code = target.charCodeAt(i);
    let upper = code >= 65 && code <= 90;
    let alnum = upper || code >= 97 && code <= 122 || code >= 48 && code <= 57;
    let beginning = upper && !wasUpper || !wasAlnum || !alnum;
    wasUpper = upper;
    wasAlnum = alnum;
    if (!beginning) continue;
    count++;
    packed.push(i);
    code = lowerCodes[i];
    if (code >= 97 && code <= 122) {
      let slot = offset + code - 97;
      if (firstTable[slot] === 0) firstTable[slot] = i + 1;
    }
  }
  prepared._beginningsLen = count;
}
function prepareSingleMatch(prepared, searchCode, fallbackIndex) {
  let matchI = fallbackIndex;
  let strict = false;
  scanBeginnings(prepared, (i) => {
    if (!strict && searchCode === prepared._targetLowerCodes[i]) {
      matchI = i;
      strict = true;
    }
  });
  prepared._singleMatchCode = searchCode;
  prepared._singleMatchIndex = matchI;
  prepared._singleMatchStrict = strict;
}
function makeBeginnings(prepared) {
  let beginnings = [];
  scanBeginnings(prepared, (i) => beginnings.push(i));
  return beginnings;
}
function makeNextBeginnings(prepared) {
  let next = [];
  let fill = 0;
  scanBeginnings(prepared, (i) => {
    for (; fill < i; fill++) next[fill] = i;
  });
  for (; fill < prepared.target.length; fill++) next[fill] = prepared.target.length;
  return next;
}
function remapCharacter(char) {
  let remapped = remappings[char];
  if (remapped !== void 0) return remapped;
  if (char.charCodeAt(0) < 128) return char;
  remapped = char.normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
  return remapped.length === 1 ? remapped : char;
}
function remapChars(value) {
  if (customAsciiRemappings) return value.replace(/[\s\S]/g, remapCharacter);
  return /[^\x00-\x7F]|[\\"`]/.test(value) ? value.replace(/[^\x00-\x7F]|[\\"`]/g, remapCharacter) : value;
}
function lowerInfo(value) {
  return lowerInfoRemapped(remapChars(value));
}
function lowerInfoRemapped(value) {
  let lower = value.toLowerCase();
  let lowerCodes = [];
  let bitflags = 0;
  let hasSpace = false;
  for (let i = 0; i < lower.length; i++) {
    let code = lowerCodes[i] = lower.charCodeAt(i);
    if (code === 32) {
      hasSpace = true;
      bitflags |= SPACE_BIT;
      continue;
    }
    let bit = code >= 97 && code <= 122 ? code - 97 : code >= 48 && code <= 57 ? 26 : code <= 127 ? 30 : 31;
    bitflags |= 1 << bit;
  }
  return { lowerCodes, bitflags, hasSpace, _lower: lower };
}
var Result = class {
  get ["indexes"]() {
    return this._indexes.slice(0, this._indexes.len).sort((a, b) => a - b);
  }
  set ["indexes"](value) {
    this._indexes = value;
  }
  ["highlight"](open, close, threshold) {
    return highlight(this, open, close, threshold);
  }
  get ["score"]() {
    return normalizeScore(this._score);
  }
};
var KeysResult = class extends Array {
  get ["score"]() {
    return normalizeScore(this._score);
  }
};
function newResult(target, score2 = -INF, obj = null, lower = "", lowerCodes = null, bitflags = 0) {
  let result = new Result();
  result.target = target;
  result.obj = obj;
  result._score = score2;
  result._indexes = [];
  result._targetLower = lower;
  result._targetLowerCodes = lowerCodes;
  result._nextBeginningIndexes = null;
  result._beginnings = null;
  result._beginningsLen = 0;
  result._singleMatchCode = result._singleMatchIndex = -1;
  result._singleMatchStrict = false;
  result._bitflags = bitflags;
  return result;
}
function materialize(prepared, obj = null) {
  let result = new Result();
  result.target = prepared.target;
  result.obj = obj;
  result._score = prepared._score;
  result._indexes = prepared._indexes;
  return result;
}
function markBestKeyScore(result) {
  let best = -INF;
  for (let i = 0; i < result.length; i++) if (result[i] !== noTarget && result[i]._score > best) best = result[i]._score;
  for (let i = 0; i < result.length; i++) if (result[i] !== noTarget) result[i]._bestKeyScore = best;
  return result;
}
function captureKeysResult(matches, keysLength, obj, score2, partWinners = false) {
  let result = new KeysResult(keysLength);
  for (let k = 0; k < keysLength; k++) result[k] = matches[k];
  result.obj = obj;
  result._score = score2;
  if (partWinners) result._partWinners = true;
  return result;
}
var normalizeScore = (value) => value === -INF ? 0 : value > 1 ? value : Math.E ** (((-value + 1) ** 0.04307 - 1) * -2);
var denormalizeScore = (value) => value === 0 ? -INF : value > 1 ? value : 1 - Math.pow(Math.log(value) / -2 + 1, 1 / 0.04307);
var GOOD_PART_SCORE = denormalizeScore(0.5);
var isPrepared = (value) => typeof value === "object" && typeof value?._bitflags === "number";
function makeGetter(key) {
  if (typeof key === "function") return key;
  let path = Array.isArray(key) ? key : typeof key === "string" && key.includes(".") ? key.split(".") : null;
  if (path === null) return null;
  return (obj) => {
    if (path !== key) {
      let direct = obj[key];
      if (direct !== void 0) return direct;
    }
    for (let i = 0; obj && i < path.length; i++) obj = obj[path[i]];
    return obj;
  };
}
function scoreCeiling(searchLen, targetLen) {
  let lengthPenalty = (targetLen - searchLen) / 2;
  let bonus = 1 + searchLen * searchLen;
  let score2 = -lengthPenalty - lengthPenalty / (bonus * bonus);
  return score2 + Math.min(4, -score2 / 2);
}
function bitCount(value) {
  value -= value >>> 1 & 1431655765;
  value = (value & 858993459) + (value >>> 2 & 858993459);
  return (value + (value >>> 4) & 252645135) * 16843009 >>> 24;
}
function lowerBound(values, start, end, value) {
  while (start < end) {
    let middle = start + end >> 1;
    if (values[middle] < value) start = middle + 1;
    else end = middle;
  }
  return start;
}
function nextBeginning(indexes, start, end, index, targetLen) {
  let next = lowerBound(indexes, start, end, index + 1);
  return next < end ? indexes[next] : targetLen;
}
function isBeginning(indexes, start, end, index) {
  let found = lowerBound(indexes, start, end, index);
  return found < end && indexes[found] === index;
}
function getLimit(options) {
  return (options?.limit ?? 10) || INF;
}
function scheduleTask(run) {
  let id;
  if (typeof requestIdleCallback === "function") {
    id = requestIdleCallback(run, { timeout: 100 });
    return () => typeof cancelIdleCallback === "function" && cancelIdleCallback(id);
  }
  if (typeof setImmediate === "function") {
    id = setImmediate(run);
    return () => typeof clearImmediate === "function" && clearImmediate(id);
  }
  id = setTimeout(run);
  return () => clearTimeout(id);
}
function createHeap() {
  let items = [];
  let length = 0;
  function down() {
    let index = 0;
    let item = items[0];
    for (let child = 1; child < length; child = 1 + index * 2) {
      let right = child + 1;
      index = right < length && items[right]._score < items[child]._score ? right : child;
      items[index - 1 >> 1] = items[index];
    }
    for (let parent = index - 1 >> 1; index > 0 && item._score < items[parent]._score; parent = (index = parent) - 1 >> 1) {
      items[index] = items[parent];
    }
    items[index] = item;
  }
  return {
    add(item) {
      let index = length++;
      for (let parent = index - 1 >> 1; index > 0 && item._score < items[parent]._score; parent = (index = parent) - 1 >> 1) {
        items[index] = items[parent];
      }
      items[index] = item;
    },
    poll() {
      if (!length) return;
      let root = items[0];
      let last = items[--length];
      items[length] = void 0;
      if (length) {
        items[0] = last;
        down();
      }
      return root;
    },
    peek() {
      return length ? items[0] : void 0;
    },
    replaceTop(item) {
      items[0] = item;
      down();
    },
    clear() {
      items.length = length = 0;
    }
  };
}
var INF = Infinity;
var SPACE_BIT = 1 << 27;
var noResults = [];
noResults.total = 0;
var targetCache = /* @__PURE__ */ new Map();
var searchCache = /* @__PURE__ */ new Map();
var simpleMatch = [];
var strictMatch = [];
var seen = [];
var seenAt = [];
var changes = [];
var partials = [];
var spaceScores = [];
var partIndexes = [];
var winnerIndexes = [];
var winnerScores = [];
var winnerKeys = [];
var keyTargets = [];
var keyResults = [];
var candidateBitOffsets = [];
var seenGeneration = 0;
var remappings = {};
var remapFrom = '\\"`\u2018\u2019\u201A\u201B\u201C\u201D\u201E\u201F\xAB\xBB\u2039\u203A\u2010\u2013\u2014\u2212\u2044\u2215\u2026\xF8\xD8\u0142\u0141\u0111\u0110\xF0\xD0\u0131\u0127\u0126\u0167\u0166';
var remapTo = "/''''''''''''''----//.oOlLdDdDihHtT";
for (let i = 0; i < remapFrom.length; i++) remappings[remapFrom[i]] = remapTo[i];
var customAsciiRemappings = false;
var heap = createHeap();
var noTarget = prepTarget("");
var prunedMatch = {};
var fuzzysort_default = { single, go, highlight, score, remap, prepare, snapshot, cleanup };

// src/client/index.jsx
var import_jsx_runtime = require("react/jsx-runtime");
var inject = ["slots", "connection", "sessions", "inputTriggers"];
var USAGE_KEY = "dsh-skill-picker:usage";
function loadUsage() {
  try {
    const raw = localStorage.getItem(USAGE_KEY);
    if (raw === null) return {};
    const parsed = JSON.parse(raw);
    return parsed !== null && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}
function saveUsage(usage) {
  try {
    localStorage.setItem(USAGE_KEY, JSON.stringify(usage));
  } catch {
  }
}
function rankByUsage(skills, usage) {
  return skills.slice().sort((a, b) => {
    const ua = usage[a.name];
    const ub = usage[b.name];
    const la = ua?.lastUsed ?? 0;
    const lb = ub?.lastUsed ?? 0;
    if (la !== lb) return lb - la;
    const ca = ua?.count ?? 0;
    const cb = ub?.count ?? 0;
    if (ca !== cb) return cb - ca;
    return a.name.localeCompare(b.name);
  });
}
var buttonStyle = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: "28px",
  height: "28px",
  margin: "0 2px",
  padding: "0",
  border: "1px solid var(--dsw-alias-border-l2, rgba(128,128,128,0.25))",
  borderRadius: "8px",
  background: "transparent",
  color: "var(--dsw-alias-label-secondary, #c9d2e0)",
  cursor: "pointer",
  fontSize: "15px",
  lineHeight: "1",
  flex: "none"
};
var popoverStyle = {
  position: "absolute",
  bottom: "calc(100% + 8px)",
  right: "0",
  width: "340px",
  maxHeight: "320px",
  display: "flex",
  flexDirection: "column",
  background: "var(--dsw-specific-tip, #1e2533)",
  border: "1px solid var(--dsw-alias-border-l1, rgba(128,128,128,0.35))",
  borderRadius: "12px",
  boxShadow: "0 8px 28px rgba(0,0,0,0.35)",
  overflow: "hidden",
  zIndex: 1e3
};
var searchStyle = {
  boxSizing: "border-box",
  width: "calc(100% - 16px)",
  margin: "8px",
  padding: "6px 10px",
  border: "1px solid var(--dsw-alias-border-l1, rgba(128,128,128,0.3))",
  borderRadius: "8px",
  background: "var(--dsw-alias-interactive-bg-hover, rgba(128,128,128,0.1))",
  color: "var(--dsw-alias-label-primary, #e6ebf2)",
  fontSize: "13px",
  outline: "none"
};
var listStyle = {
  overflowY: "auto",
  flex: "auto",
  padding: "0 6px 8px"
};
var itemStyle = {
  display: "flex",
  flexDirection: "column",
  alignItems: "flex-start",
  gap: "2px",
  width: "100%",
  padding: "7px 10px",
  border: "none",
  borderRadius: "8px",
  background: "transparent",
  color: "var(--dsw-alias-label-primary, #e6ebf2)",
  cursor: "pointer",
  textAlign: "left"
};
var nameStyle = {
  fontFamily: "var(--ds-font-family-code, ui-monospace, monospace)",
  fontSize: "13px",
  fontWeight: 500
};
var descStyle = {
  color: "var(--dsw-alias-label-tertiary, #8a94a6)",
  fontSize: "12px",
  lineHeight: "16px",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  maxWidth: "100%"
};
var statusStyle = {
  padding: "12px",
  color: "var(--dsw-alias-label-tertiary, #8a94a6)",
  fontSize: "13px"
};
function BoltIcon() {
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("svg", { viewBox: "0 0 24 24", width: "16", height: "16", "aria-hidden": "true", style: { display: "block" }, children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("defs", { children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("linearGradient", { id: "dsh-sp-bolt-grad", x1: "0", y1: "0", x2: "0", y2: "1", children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("stop", { offset: "0%", stopColor: "var(--dsw-static-deepseek-400, rgb(103, 158, 254))" }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("stop", { offset: "100%", stopColor: "var(--dsw-static-deepseek-600, rgb(72, 104, 178))" })
    ] }) }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
      "path",
      {
        d: "M11 21h-1l1-7H7.5c-.58 0-.57-.32-.38-.66.19-.34.05-.08.07-.12C8.48 10.94 10.42 7.54 13 3h1l-1 7h3.5c.49 0 .56.33.47.51l-.07.15C12.96 17.55 11 21 11 21z",
        fill: "url(#dsh-sp-bolt-grad)",
        stroke: "var(--dsw-static-deepseek-600, rgb(72, 104, 178))",
        strokeWidth: "1",
        strokeLinejoin: "round"
      }
    )
  ] });
}
function SkillPickerButton(props) {
  const [open, setOpen] = (0, import_react.useState)(false);
  const [skills, setSkills] = (0, import_react.useState)(void 0);
  const [error, setError] = (0, import_react.useState)(void 0);
  const [query, setQuery] = (0, import_react.useState)("");
  const [usage, setUsage] = (0, import_react.useState)(() => loadUsage());
  const boxRef = (0, import_react.useRef)(null);
  const load = (0, import_react.useCallback)(async () => {
    if (skills !== void 0 || error !== void 0) return;
    try {
      if (typeof props.listSkills === "function" && props.session?.sessionId !== void 0) {
        const listed = await props.listSkills(props.session.sessionId);
        setSkills(Array.isArray(listed) ? listed : []);
        return;
      }
    } catch (cause) {
      console.warn("[dsh-skill-picker] official skills API failed, falling back to host route:", cause);
    }
    try {
      const cwd = typeof props.cwd === "string" && props.cwd !== "" ? `?cwd=${encodeURIComponent(props.cwd)}` : "";
      const res = await fetch(`/dsh-skill-picker/skills${cwd}`, { headers: { accept: "application/json" } });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || "bad response");
      setSkills(Array.isArray(json.skills) ? json.skills : []);
    } catch (cause) {
      setError(String(cause?.message ?? cause));
    }
  }, [skills, error, props.listSkills, props.session, props.cwd]);
  const toggle = () => {
    if (!open) void load();
    setOpen(!open);
  };
  const pick = (name) => {
    let draft = "";
    try {
      if (props.input !== void 0 && typeof props.input.draft === "string") {
        draft = props.input.draft;
      } else if (typeof props.useInput === "function") {
        const state = props.useInput((s) => s);
        if (state !== void 0 && typeof state.draft === "string") draft = state.draft;
      }
    } catch (cause) {
      console.error("[dsh-skill-picker] reading draft failed:", cause);
    }
    const separator = draft === "" || draft.endsWith(" ") || draft.endsWith("\n") ? "" : " ";
    const next = `${draft}${separator}/${name} `;
    try {
      if (typeof props.inputActions?.setDraft === "function") {
        props.inputActions.setDraft(next);
      } else {
        console.error("[dsh-skill-picker] inputActions.setDraft unavailable; draft not written:", next);
      }
    } catch (cause) {
      console.error("[dsh-skill-picker] setDraft failed:", cause);
    }
    const nextUsage = { ...usage, [name]: { count: (usage[name]?.count ?? 0) + 1, lastUsed: Date.now() } };
    setUsage(nextUsage);
    saveUsage(nextUsage);
    setOpen(false);
    setQuery("");
  };
  (0, import_react.useEffect)(() => {
    if (!open) return;
    const onDown = (event) => {
      if (boxRef.current !== null && !boxRef.current.contains(event.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);
  const ordered = rankByUsage(skills ?? [], usage);
  const filtered = ordered.filter((skill) => {
    const q = query.trim().toLowerCase();
    if (q === "") return true;
    return skill.name.toLowerCase().includes(q) || String(skill.description ?? "").toLowerCase().includes(q);
  }).slice(0, 60);
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { ref: boxRef, style: { position: "relative", display: "inline-flex", flex: "none" }, children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
      "button",
      {
        type: "button",
        onClick: toggle,
        title: "\u9009\u62E9\u6280\u80FD\uFF08\u63D2\u5165 /\u6280\u80FD\u540D \u5230\u53D1\u9001\u6846\uFF09",
        "aria-label": "\u9009\u62E9\u6280\u80FD",
        style: {
          ...buttonStyle,
          ...open ? { color: "var(--dsw-alias-label-primary-bluish, #4cc9f0)" } : {}
        },
        children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(BoltIcon, {})
      }
    ),
    open && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: popoverStyle, children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
        "input",
        {
          value: query,
          onChange: (event) => setQuery(event.target.value),
          placeholder: "\u641C\u7D22\u6280\u80FD\u2026",
          style: searchStyle,
          autoFocus: true
        }
      ),
      error !== void 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: statusStyle, children: `\u52A0\u8F7D\u5931\u8D25\uFF1A${error}` }) : skills === void 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: statusStyle, children: "\u52A0\u8F7D\u4E2D\u2026" }) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: listStyle, children: filtered.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: statusStyle, children: "\u6CA1\u6709\u5339\u914D\u7684\u6280\u80FD" }) : filtered.map((skill) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
        "button",
        {
          type: "button",
          onClick: () => pick(skill.name),
          onMouseEnter: (event) => {
            event.currentTarget.style.background = "var(--dsw-alias-interactive-bg-hover, rgba(128,128,128,0.12))";
          },
          onMouseLeave: (event) => {
            event.currentTarget.style.background = "transparent";
          },
          style: itemStyle,
          children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: nameStyle, children: `/${skill.name}` }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: descStyle, children: skill.description ?? "" })
          ]
        },
        skill.name
      )) })
    ] })
  ] });
}
function apply(ctx) {
  const listSkills = async (sessionId) => {
    const skills = ctx.connection?.api?.skills;
    if (skills === void 0 || typeof skills.list !== "function") {
      throw new Error("connection.api.skills unavailable");
    }
    const controller = new AbortController();
    const { result } = await skills.list({ sessionId }, controller.signal);
    if (!result.ok) throw new Error(`skill.list failed: ${result.error?.code}: ${result.error?.message}`);
    const raw = result.value?.skills ?? [];
    return raw.map((skill) => ({ name: skill.name, description: skill.description ?? "" }));
  };
  let currentCwd = "";
  const syncCwd = () => {
    try {
      const snapshot2 = ctx.sessions.list.getSnapshot();
      const sessionId = snapshot2.current;
      const cwd = sessionId === void 0 ? void 0 : snapshot2.byId[sessionId]?.cwd;
      currentCwd = typeof cwd === "string" ? cwd : "";
    } catch {
      currentCwd = "";
    }
  };
  syncCwd();
  const unsubscribe = ctx.sessions.list.subscribe(syncCwd);
  ctx.effect(() => {
    const PickerWithCwd = (props) => import_react.default.createElement(SkillPickerButton, { ...props, cwd: currentCwd, listSkills });
    const dispose = ctx.slots.inject(
      "conversation.input.right",
      () => ctx.slots.register(
        { name: "conversation.input.right", id: "skill-picker", order: 100, label: "Skill picker" },
        PickerWithCwd
      )
    );
    return () => {
      dispose();
      unsubscribe();
    };
  }, "dsh-skill-picker: composer input slot");
  ctx.effect(() => {
    const namesCache = /* @__PURE__ */ new Map();
    const lexiconListeners = /* @__PURE__ */ new Map();
    const notifyLexicon = (sessionId) => {
      for (const fn of [...lexiconListeners.get(sessionId) ?? []]) {
        try {
          fn();
        } catch (err) {
          console.error("[dsh-skill-picker] lexicon listener failed:", err);
        }
      }
    };
    const refreshNames = async (sessionId) => {
      try {
        const skills = await listSkills(sessionId);
        namesCache.set(sessionId, (Array.isArray(skills) ? skills : []).map((s) => s.name));
        notifyLexicon(sessionId);
      } catch {
      }
    };
    const source = {
      trigger: "/",
      name: "skill-fuzzy",
      order: -10,
      async candidates(session, { query, signal }) {
        const skills = await listSkills(session.sessionId);
        if (signal.aborted) return [];
        namesCache.set(session.sessionId, skills.map((s) => s.name));
        notifyLexicon(session.sessionId);
        const ordered = rankByUsage(skills, loadUsage());
        const q = String(query ?? "").trim().toLowerCase();
        if (q === "") {
          return ordered.map((s) => ({ name: s.name, description: s.description }));
        }
        const targets = ordered.map((s) => ({ s, search: `${s.name} ${s.description ?? ""}` }));
        const results = fuzzysort_default.go(q, targets, {
          key: "search",
          limit: 12,
          threshold: -1e4
        });
        return results.filter((r) => r.score > 0).map((r) => ({ name: r.obj.s.name, description: r.obj.s.description }));
      },
      warm(session) {
        refreshNames(session.sessionId);
      },
      lexicon(session) {
        return namesCache.get(session.sessionId);
      },
      subscribeLexicon(session, listener) {
        const key = session.sessionId;
        const set = lexiconListeners.get(key) ?? /* @__PURE__ */ new Set();
        set.add(listener);
        lexiconListeners.set(key, set);
        return () => {
          const cur = lexiconListeners.get(key);
          if (cur !== void 0) {
            cur.delete(listener);
            if (cur.size === 0) lexiconListeners.delete(key);
          }
        };
      },
      onPick({ candidate }) {
        try {
          const usage = loadUsage();
          const name = candidate.name;
          const next = { ...usage, [name]: { count: (usage[name]?.count ?? 0) + 1, lastUsed: Date.now() } };
          saveUsage(next);
        } catch {
        }
        return { text: `/${candidate.name} ` };
      }
    };
    const unregister = ctx.inputTriggers.registerSource(source);
    return () => {
      unregister();
      namesCache.clear();
      lexiconListeners.clear();
    };
  }, "dsh-skill-picker: fuzzy / source");
}
return module.exports; } });
//# sourceMappingURL=client.js.map
