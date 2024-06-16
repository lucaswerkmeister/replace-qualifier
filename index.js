import Session from 'm3api/node.js';
import { login } from 'm3api-botpassword';

const userAgent = 'replace-qualifier (https://github.com/lucaswerkmeister/replace-qualifier; mail@lucaswerkmeister.de)';

async function queryEntities( sparql ) {
	const url = new URL( 'https://query.wikidata.org/sparql' );
	url.searchParams.set( 'query', sparql );
	const response = await fetch( url, {
		headers: {
			'Accept': 'application/sparql-results+json',
			'User-Agent': userAgent,
		},
	} );
	const json = await response.json();
	const entityIds = [];
	for ( const bindings of json.results.bindings ) {
		const entityId = bindings.entity.value.replace( /^http:\/\/www\.wikidata\.org\/entity\//, '' );
		entityIds.push( entityId );
	}
	return entityIds;
}

async function * replaceQualifier( session, entityId, mainProperty, qualifierProperty, fromString, toString, summary ) {
	const statements = await session.request( {
		action: 'wbgetclaims',
		entity: entityId,
		property: mainProperty,
	} );
	for ( const statement of statements.claims[ mainProperty ] || [] ) {
		let changed = false;
		for ( const qualifier of statement.qualifiers[ qualifierProperty ] || [] ) {
			if ( qualifier.snaktype === 'value' && qualifier.datavalue.type === 'string' && qualifier.datavalue.value === fromString ) {
				qualifier.datavalue.value = toString;
				changed = true;
			}
		}
		if ( !changed ) {
			continue;
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
		yield response.pageinfo.lastrevid;
	}
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

for await ( const revid of replaceQualifier( session, 'P370', 'P2302', 'P1793', '.+', '.*', 'testing replace-qualifier' ) ) {
	console.log( `https://www.wikidata.org/wiki/Special:Diff/${revid}` );
}

/*
console.log( await queryEntities( `
SELECT ?entity WHERE {
  ?entity p:P2302 [
    ps:P2302 wd:Q21502404;
    pq:P1793 "[1-9]\\\\d*"
  ].
}
` ) );
*/

