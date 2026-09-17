/** 内置示例：覆盖折叠、key 乱序、冲突、缺号、阻断后事件与非法行。 */
export const SAMPLE_NDJSON = `{"stream":"orders","sequence":1,"payload":{"id":"o-100","amount":42}}
{"stream":"orders","sequence":1,"payload":{"id":"o-100","amount":42}}
{"stream":"orders","sequence":2,"payload":{"id":"o-101","amount":17}}
{"stream":"orders","sequence":2,"payload":{"amount":17,"id":"o-101"}}
{"stream":"orders","sequence":3,"payload":{"id":"o-102","amount":99}}
{"stream":"orders","sequence":3,"payload":{"id":"o-102","amount":100}}
{"stream":"orders","sequence":4,"payload":{"id":"o-103","amount":55}}
{"stream":"payments","sequence":10,"payload":{"channel":"visa"}}
{"stream":"payments","sequence":11,"payload":{"channel":"mastercard"}}
{"stream":"payments","sequence":13,"payload":{"channel":"amex"}}
{"stream":"payments","sequence":13,"payload":{"channel":"diners"}}
{"stream":"payments","sequence":14,"payload":"ok}
`;
