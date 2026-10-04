// Decoder for the Upstox Market Data Feed V3 protobuf messages.
// Source: MarketDataFeedV3.proto from the Upstox Node.js SDK examples. `google.protobuf.DoubleValue`
// is declared locally (wire-identical) so no import resolution is needed at runtime.

import protobuf from 'protobufjs';

export const FEED_PROTO_SOURCE = `
syntax = "proto3";
package com.upstox.marketdatafeederv3udapi.rpc.proto;

message DoubleValue { double value = 1; }

message LTPC {
  double ltp = 1;
  int64 ltt = 2;
  int64 ltq = 3;
  double cp = 4;
  DoubleValue iep = 5;
}

message OHLC {
  string interval = 1;
  double open = 2;
  double high = 3;
  double low = 4;
  double close = 5;
  int64 vol = 6;
  int64 ts = 7;
}
message MarketOHLC { repeated OHLC ohlc = 1; }

message Quote { int64 bidQ = 1; double bidP = 2; int64 askQ = 3; double askP = 4; }
message MarketLevel { repeated Quote bidAskQuote = 1; }
message OptionGreeks { double delta = 1; double theta = 2; double gamma = 3; double vega = 4; double rho = 5; }

message MarketFullFeed {
  LTPC ltpc = 1;
  MarketLevel marketLevel = 2;
  OptionGreeks optionGreeks = 3;
  MarketOHLC marketOHLC = 4;
  double atp = 5;
  int64 vtt = 6;
  double oi = 7;
  double iv = 8;
  double tbq = 9;
  double tsq = 10;
  double iep = 11;
  double rp = 12;
  int64 ieq = 13;
  int64 iiqTotal = 14;
  int64 iiqM = 15;
  bool casEligible = 16;
}
message IndexFullFeed { LTPC ltpc = 1; MarketOHLC marketOHLC = 2; }
message FullFeed {
  oneof FullFeedUnion {
    MarketFullFeed marketFF = 1;
    IndexFullFeed indexFF = 2;
  }
}
message FirstLevelWithGreeks {
  LTPC ltpc = 1;
  Quote firstDepth = 2;
  OptionGreeks optionGreeks = 3;
  int64 vtt = 4;
  double oi = 5;
  double iv = 6;
}

enum RequestMode { ltpc = 0; full_d5 = 1; option_greeks = 2; full_d30 = 3; }
enum Type { initial_feed = 0; live_feed = 1; market_info = 2; }
enum MarketStatus { PRE_OPEN_START = 0; PRE_OPEN_END = 1; NORMAL_OPEN = 2; NORMAL_CLOSE = 3; CLOSING_START = 4; CLOSING_END = 5; }

message StatusInfo { string status = 1; int64 updatedTime = 2; }
message MarketInfo {
  map<string, MarketStatus> segmentStatus = 1;
  map<string, StatusInfo> casMarketStatus = 2;
  map<string, StatusInfo> preOpenSessionStatus = 3;
}

message Feed {
  oneof FeedUnion {
    LTPC ltpc = 1;
    FullFeed fullFeed = 2;
    FirstLevelWithGreeks firstLevelWithGreeks = 3;
  }
  RequestMode requestMode = 4;
}

message FeedResponse {
  Type type = 1;
  map<string, Feed> feeds = 2;
  int64 currentTs = 3;
  MarketInfo marketInfo = 4;
}
`;

const PACKAGE = 'com.upstox.marketdatafeederv3udapi.rpc.proto';

export const feedRoot = protobuf.parse(FEED_PROTO_SOURCE, { keepCase: true }).root;
const FeedResponse = feedRoot.lookupType(`${PACKAGE}.FeedResponse`);

export interface DecodedLtpc {
  ltp?: number;
  /** Last trade time, epoch milliseconds. */
  ltt?: number;
  cp?: number;
}

export interface DecodedFeed {
  ltpc?: DecodedLtpc;
  fullFeed?: {
    marketFF?: { ltpc?: DecodedLtpc };
    indexFF?: { ltpc?: DecodedLtpc };
  };
}

export interface DecodedFeedResponse {
  type?: 'initial_feed' | 'live_feed' | 'market_info';
  feeds?: Record<string, DecodedFeed>;
  currentTs?: number;
}

export function decodeFeedResponse(buffer: Uint8Array): DecodedFeedResponse {
  const message = FeedResponse.decode(buffer);
  return FeedResponse.toObject(message, {
    longs: Number,
    enums: String,
    defaults: false,
  });
}

/** Latest-trade fields from whichever feed shape was delivered (ltpc, or full-feed index/market). */
export function ltpcOf(feed: DecodedFeed): DecodedLtpc | undefined {
  return feed.ltpc ?? feed.fullFeed?.indexFF?.ltpc ?? feed.fullFeed?.marketFF?.ltpc;
}
