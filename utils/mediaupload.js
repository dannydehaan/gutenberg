/**
 * External Dependencies
 */
import { compact, forEach, get, includes, noop, startsWith } from 'lodash';

/**
 * WordPress dependencies
 */
import { __, sprintf } from '@wordpress/i18n';

/**
 * WordPress dependencies
 */
import apiRequest from '@wordpress/api-request';

/**
 *	Media Upload is used by audio, image, gallery and video blocks to handle uploading a media file
 *	when a file upload button is activated.
 *
 *	TODO: future enhancement to add an upload indicator.
 *
 * @param   {Object}   $0                   Parameters object passed to the function.
 * @param   {string}   $0.allowedType       The type of media that can be uploaded.
 * @param   {?Object}  $0.additionalData    Additional data to include in the request.
 * @param   {Array}    $0.filesList         List of files.
 * @param   {?number}  $0.maxUploadFileSize Maximum upload size in bytes allowed for the site.
 * @param   {Function} $0.onError           Function called when an error happens.
 * @param   {Function} $0.onFileChange      Function called each time a file or a temporary representation of the file is available.
 */
export function mediaUpload( {
	allowedType,
	additionalData = {},
	filesList,
	maxUploadFileSize = get( window, [ '_wpMediaSettings', 'maxUploadSize' ], 0 ),
	onError = noop,
	onFileChange,
} ) {
	// Cast filesList to array
	const files = [ ...filesList ];

	const filesSet = [];
	const setAndUpdateFiles = ( idx, value ) => {
		filesSet[ idx ] = value;
		onFileChange( compact( filesSet ) );
	};

	// Allowed type specified by consumer
	const isAllowedType = ( fileType ) => startsWith( fileType, `${ allowedType }/` );

	// Allowed types for the current WP_User
	const allowedMimeTypesForUser = get( window, [ '_wpMediaSettings', 'allowedMimeTypes' ] );
	const isAllowedMimeTypeForUser = ( fileType ) => {
		return includes( allowedMimeTypesForUser, fileType );
	};

	files.forEach( ( mediaFile, idx ) => {
		if ( ! isAllowedType( mediaFile.type ) ) {
			return;
		}

		// verify if user is allowed to upload this mime type
		if ( allowedMimeTypesForUser && ! isAllowedMimeTypeForUser( mediaFile.type ) ) {
			onError( {
				code: 'MIME_TYPE_NOT_ALLOWED_FOR_USER',
				message: __( 'Sorry, this file type is not permitted for security reasons.' ),
				file: mediaFile,
			} );
			return;
		}

		// verify if file is greater than the maximum file upload size allowed for the site.
		if ( maxUploadFileSize && mediaFile.size > maxUploadFileSize ) {
			onError( {
				code: 'SIZE_ABOVE_LIMIT',
				message: sprintf(
					__( '%s exceeds the maximum upload size for this site.' ),
					mediaFile.name
				),
				file: mediaFile,
			} );
			return;
		}

		// Set temporary URL to create placeholder media file, this is replaced
		// with final file from media gallery when upload is `done` below
		filesSet.push( { url: window.URL.createObjectURL( mediaFile ) } );
		onFileChange( filesSet );

		return createMediaFromFile( mediaFile, additionalData ).then(
			( savedMedia ) => {
				const mediaObject = {
					alt: savedMedia.alt_text,
					caption: get( savedMedia, [ 'caption', 'raw' ], '' ),
					id: savedMedia.id,
					link: savedMedia.link,
					url: savedMedia.source_url,
				};
				setAndUpdateFiles( idx, mediaObject );
			},
			() => {
				// Reset to empty on failure.
				setAndUpdateFiles( idx, null );
				onError( {
					code: 'GENERAL',
					message: sprintf(
						__( 'Error while uploading file %s to the media library.' ),
						mediaFile.name
					),
					file: mediaFile,
				} );
			}
		);
	} );
}

/**
 * @param {File}    file           Media File to Save.
 * @param {?Object} additionalData Additional data to include in the request.
 *
 * @return {Promise} Media Object Promise.
 */
function createMediaFromFile( file, additionalData ) {
	// Create upload payload
	const data = new window.FormData();
	data.append( 'file', file, file.name || file.type.replace( '/', '.' ) );
	forEach( additionalData, ( ( value, key ) => data.append( key, value ) ) );
	return apiRequest( {
		path: '/wp/v2/media',
		data,
		contentType: false,
		processData: false,
		method: 'POST',
	} );
}

/**
 * Utility used to preload an image before displaying it.
 *
 * @param   {string}  url Image Url.
 * @return {Promise}     Promise resolved once the image is preloaded.
 */
export function preloadImage( url ) {
	return new Promise( ( resolve ) => {
		const newImg = new window.Image();
		newImg.onload = function() {
			resolve( url );
		};
		newImg.src = url;
	} );
}
