from flask import Flask, request, send_file, jsonify
from flask_cors import CORS
from rembg import remove
from PIL import Image
import io
import traceback
import base64

import vertexai
from vertexai.preview.vision_models import ImageGenerationModel
from vertexai.generative_models import GenerativeModel

app = Flask(__name__)
# Bật CORS cho tất cả các domain (phục vụ Frontend chạy port 5173)
CORS(app)

# Khởi tạo Vertex AI
try:
    vertexai.init(project="api-1-490713", location="us-central1")
    imagen_model = ImageGenerationModel.from_pretrained("imagen-3.0-generate-001")
    # Sử dụng Gemini 2.5 Flash Lite để dịch thuật siêu tốc
    translation_model = GenerativeModel("gemini-2.5-flash-lite")
    print("Vertex AI Models initialized successfully.")
except Exception as e:
    print("Error initializing Vertex AI. Check your Application Default Credentials:", e)
    imagen_model = None
    translation_model = None

@app.route('/remove-bg', methods=['POST'])
def remove_background():
    if 'image' not in request.files:
        return {'error': 'No image provided'}, 400
    
    try:
        # Nhận file ảnh từ request
        file = request.files['image']
        
        # Đọc ảnh gốc bằng PIL
        input_image = Image.open(file.stream)
        
        # Gọi rembg để tách nền
        output_image = remove(input_image)
        
        # Chuyển đổi kết quả sang định dạng PNG (hỗ trợ nền trong suốt)
        img_byte_arr = io.BytesIO()
        output_image.save(img_byte_arr, format='PNG')
        img_byte_arr.seek(0)
        
        # Trả về kết quả trực tiếp dưới dạng binary image
        return send_file(
            img_byte_arr,
            mimetype='image/png',
            as_attachment=True,
            download_name='bg_removed.png'
        )
    except Exception as e:
        print("Error processing image:")
        traceback.print_exc()
        return {'error': str(e)}, 500

@app.route('/generate-image', methods=['POST'])
def generate_image():
    if not imagen_model or not translation_model:
        return jsonify({'error': 'Vertex AI is not initialized on the server.'}), 500

    data = request.json
    if not data or 'prompt' not in data:
        return jsonify({'error': 'Missing prompt in request body.'}), 400

    prompt_text = data['prompt']
    try:
        print(f"Original Prompt: '{prompt_text}'")
        
        # 1. Dịch Prompt sang Tiếng Anh bằng Gemini
        translate_prompt = f"Translate the following text to English, specifically for an image generation prompt. Just return the English translation, no other words: '{prompt_text}'"
        translation_response = translation_model.generate_content(translate_prompt)
        english_prompt = translation_response.text.strip()
        print(f"Translated English Prompt: '{english_prompt}'")
        
        # 2. Sinh ảnh bằng Imagen 3 với prompt tiếng Anh
        images = imagen_model.generate_images(
            prompt=english_prompt,
            number_of_images=1,
            aspect_ratio="1:1"
        )
        
        if not images:
            return jsonify({'error': 'Prompt của bạn bị từ chối do vi phạm chính sách nội dung (VD: Bản quyền, bạo lực, v.v.).'}), 400

        # Lấy bức ảnh đầu tiên
        generated_image = images[0]
        
        # Lấy chuỗi Base64
        base64_encoded = base64.b64encode(generated_image._image_bytes).decode("utf-8")
        base64_url = f"data:image/png;base64,{base64_encoded}"
        
        return jsonify({'url': base64_url})

    except Exception as e:
        print("Error generating image:")
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    # Chạy trên port 5000, hỗ trợ từ các client khác
    app.run(host='0.0.0.0', port=5000, debug=True)
