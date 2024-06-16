import Session from 'm3api/node.js';
import { login } from 'm3api-botpassword';

const userAgent = 'replace-qualifier (https://github.com/lucaswerkmeister/replace-qualifier; mail@lucaswerkmeister.de)';

async function queryStatements( sparql ) {
	const url = new URL( 'https://query.wikidata.org/sparql' );
	url.searchParams.set( 'query', sparql );
	const response = await fetch( url, {
		headers: {
			'Accept': 'application/sparql-results+json',
			'User-Agent': userAgent,
		},
	} );
	const json = await response.json();
	const statementIds = [];
	for ( const bindings of json.results.bindings ) {
		const statementUri = bindings.statement.value;
		const statementId = statementUri.replace( /^http:\/\/www\.wikidata\.org\/entity\/statement\//, '' )
			  .replace( '-', '$' ); // only the first one
		statementIds.push( statementId );
	}
	return statementIds;
}

async function replaceQualifier( session, statementId, mainProperty, qualifierProperty, fromString, toString, summary ) {
	const statements = await session.request( {
		action: 'wbgetclaims',
		claim: statementId,
		property: mainProperty,
	} );
	const statement = statements.claims[ mainProperty ][ 0 ];
	if  ( !statement ) {
		return null;
	}
	let changed = false;
	for ( const qualifier of statement.qualifiers[ qualifierProperty ] || [] ) {
		if ( qualifier.snaktype === 'value' && qualifier.datavalue.type === 'string' && qualifier.datavalue.value === fromString ) {
			qualifier.datavalue.value = toString;
			changed = true;
		}
	}
	if ( !changed ) {
		return null;
	}
	const response = await session.request( {
		action: 'wbsetclaim',
		claim: JSON.stringify( statement ),
		summary,
		bot: true,
	}, {
		method: 'POST',
		tokenType: 'csrf',
	} );
	return response.pageinfo.lastrevid;
}

const session = new Session( 'www.wikidata.org', {
	formatversion: 2,
	errorformat: 'plaintext',
}, {
	userAgent,
} );

const username = process.env.MW_USERNAME;
const password = process.env.MW_PASSWORD;
if ( !username || !password ) {
	throw new Error( 'Username and/or password missing (set MW_USERNAME and MW_PASSWORD environment variables)' );
}
await login( session, username, password );

const baseSummary = 'change [[Property:P1793]] from .* to .+';
const summary = `${baseSummary} ([[:toolforge:editgroups/b/CB/${Math.floor( Math.random() * Math.pow( 2, 48 ) ).toString( 16 )}|details]] )`;

const statementIds = await queryStatements( `
SELECT ?property ?propertyLabel ?statement WHERE {
  ?property a wikibase:Property;
            wdt:P31 wd:Q18720640; # sandbox property
            p:P2302 ?statement.
  ?statement ps:P2302 wd:Q21502404;
             pq:P1793 ".*".
  SERVICE wikibase:label { bd:serviceParam wikibase:language "[AUTO_LANGUAGE],en". }
}
` );
for ( const statementId of statementIds ) {
	const revid = await replaceQualifier( session, statementId, 'P2302', 'P1793', '.*', '.+', summary );
	if ( revid !== null ) {
		console.log( `https://www.wikidata.org/wiki/Special:Diff/${revid}` );
	}
}
