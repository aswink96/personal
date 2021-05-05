from django.shortcuts import render

def post_list(request):
    return render(request, 'djangogirls/post_list.html', {})